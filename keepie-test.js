// -*- js-indent-level: 4 -*-

const express=require("express");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const assert = require("assert");
const fetch = require("node-fetch");
const keepie = require("./server.js");
const multer  = require('multer');
const upload = multer();

let requestSlurp = (resolve) => {
    let body = "";
    return (response) => {
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

async function main() {
    let opts = { 
        key: await fs.promises.readFile("my.key"),
        cert: await fs.promises.readFile("cert.pem")
    };
    return [undefined, await https.createServer(opts, app).listen(2443)];
}

async function httpMain() {
    return [undefined, await http.createServer(app).listen(2080, "127.0.0.1")];
}

let receiptSerial = 1;

httpMain().then(async ([err, listener]) => {
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
});

// End
