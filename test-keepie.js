// -*- js-indent-level: 4 -*-

const express=require("express");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const assert = require("assert");
const fetch = require("node-fetch");
const multer  = require('multer');
const keepie = require("./server.js");

let requestSlurp = (resolve) => {
    let body = "";
    return (response) => {
        console.log("response status", response.statusCode);
        response.on("data", data => body = body + data);
        response.on("end", data => {
            if (data != undefined) body = body + data;
            resolve({
                body: body,
                status: response.statusCode
            });
        });
    };
};

let html = "<html><h1>hello</h1></html>";
const app = express();
app.get("/", (req, res) => {
    res.status = 200;
    res.end(html);
});

let receiptSerial = 1;

async function httpTest() {
    const upload = multer();

    let server = http.createServer(app);
    let listener = server.listen(2080);
    let port = listener.address().port;
    let secret = "secret";

    // Do Keepie boot and hit it with a request; get the server
    //  sockets and timer back
    let {requestBody: receivedPassword,
         keepieListener,
         keepieInterval} = await new Promise(async (resolve, reject) => {
             let uniqueReceiptPath = "/password" + (++receiptSerial);
             let receiptUrl = `http://localhost:${port}${uniqueReceiptPath}`;

             // Boot keepie and get the listener and interval
             let [keepieListener, keepieInterval] = await new Promise((resolve, reject) => {
                 let keepieInterval = keepie.boot(2081, {
                     id: "http",
                     config: {
                         get: (service) => {
                             return {
                                 urls: [receiptUrl],
                                 password: secret,
                                 type: "plain"
                             };
                         }
                     },
                     listenerCallback: function (listener) {
                         resolve([listener, keepieInterval]);
                     }
                 });
             });

             // Setup a root for the path we made
             app.post(uniqueReceiptPath, upload.array(), function (request, response) {
                 response.sendStatus(204);
                 try {
                     const {name, password} = request.body;
                     resolve({
                         requestBody: request.body,
                         keepieListener: keepieListener,
                         keepieInterval: keepieInterval
                     });
                 }
                 catch (e) {
                     reject(e);
                 }
             });
             
             let {status: keepiePasswordStatus} = await new Promise((resolve, reject) => {
                 http.request({
                     protocol: "http:",
                     host: "localhost",
                     port: keepieListener.address().port,
                     path: "/keepie/test-service/request",
                     method: "POST",
                     headers: {
                         "x-receipt-url": receiptUrl
                     }
                 }, requestSlurp(resolve)).end();
             });
         });

    // Close the sockets
    keepieListener.close();
    listener.close();
    // And the timer
    clearInterval(keepieInterval);

    // Check the password
    assert.deepStrictEqual(secret, receivedPassword.password);
}

async function httpsTest() {
    const upload = multer();
    let bashResult = await new Promise((resolve, reject) => {
        let certCreateBashScript = spawn("bash", ["certsetup"]);
        certCreateBashScript.stdout.pipe(process.stdout);
        certCreateBashScript.stderr.pipe(process.stderr);
        certCreateBashScript.on("exit", result => {
            resolve(result);
        });
    });

    console.log("cert create shell script exit>", bashResult);

    if (bashResult > 0) {
        return [new Error({bashResult: bashResult})];
    }
    
    let opts = { 
        key: await fs.promises.readFile("my.key"),
        cert: await fs.promises.readFile("cert.pem")
    };
    let server = https.createServer(opts, app);
    let listener = server.listen(2443);

    let ca = await fs.promises.readFile("cacert.pem");
    let port = listener.address().port;
    let secret = "secret";

    // Do Keepie boot and hit it with a request; get the server
    //  sockets and timer back
    let {requestBody: receivedPassword,
         keepieListener,
         keepieInterval} = await new Promise(async (resolve, reject) => {
             let uniqueReceiptPath = "/password" + (++receiptSerial);
             let receiptUrl = `https://localhost:${port}${uniqueReceiptPath}`;

             // Boot keepie and get the listener and interval
             let [keepieListener, keepieInterval] = await new Promise(async (resolve, reject) => {
                 let ca = await fs.promises.readFile("cacert.pem");
                 let keepieInterval = keepie.boot(2081, {
                     id: "https",
                     ca: ca,
                     config: {
                         get: (service) => {
                             return {
                                 urls: [receiptUrl],
                                 password: secret,
                                 type: "plain"
                             };
                         }
                     },
                     listenerCallback: function (listener) {
                         resolve([listener, keepieInterval]);
                     }
                 });
             });

             // Setup a root for the path we made
             app.post(uniqueReceiptPath, upload.array(), function (request, response) {
                 response.sendStatus(204);
                 resolve({
                     requestBody: request.body,
                     keepieListener: keepieListener,
                     keepieInterval: keepieInterval
                 });
             });

             let {status: keepiePasswordStatus} = await new Promise((resolve, reject) => {
                 http.request({
                     protocol: "http:",
                     host: "localhost",
                     port: keepieListener.address().port,
                     path: "/keepie/test-service/request",
                     method: "POST",
                     headers: {
                         "x-receipt-url": receiptUrl
                     }
                 }, requestSlurp(resolve)).end();
             });
         });

    // Close the sockets
    keepieListener.close();
    listener.close();
    // And the timer
    clearInterval(keepieInterval);

    // Check the password
    assert.deepStrictEqual(secret, receivedPassword.password);
}

async function main() {
    await httpTest();
    await httpsTest();
    return 0;
}

main().then(_ => []);

// End
