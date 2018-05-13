// pg - an example keepie "client" with a pg db
// Copyright (C) 2018 by Nic Ferrier

const fs = require('./fsasync.js');
const path = require('path');
const { URL } = require('url');
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const net = require('net');

const fetch = require("node-fetch");
const express = require("express");
const bodyParser = require("body-parser");
const multer  = require('multer')

const app = express();
const upload = multer()

function getFreePort () {
    let server = net.createServer(function(sock) { sock.close(); });
    return new Promise(function (resolve, reject) {
        try {
            let listener = server.listen(0, "127.0.0.1", function () {
                let address = listener.address();
                server.close();
                resolve(address);
            });
        }
        catch (e) {
            reject(e);
        }
    });
}

exports.boot = function (portToListen, options) {
    let opts = options != undefined ? options : {};
    let rootDir = opts.rootDir != undefined ? opts.rootDir : __dirname + "/www";

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));
    //app.use("/keepie", express.static(rootDir));

    app.post("/pg/keepie-secret/", upload.array(), async function (req, response) {
        let data = req.body;
        let { name, password } = data;
        if (name !== "myservice" || password === undefined) {
            response.sendStatus(400);
            return;
        }

        // Do the postgres init after the response has gone back
        response.on("finish", async function () {
            console.log("finish event called");
            try {
                // Get a spare socket
                let listenerAddress = await getFreePort();
                let socketNumber = "" + listenerAddress.port;
                console.log("socket number", socketNumber);
            
                // Do Pg init
                let dbDir = __dirname + "/dbdir";
                let dbdirExists = await fs.existsAsync(dbDir);
                if (dbdirExists) {
                    // start the db
                }
                else {
                    let initdbPath = "/usr/lib/postgresql/10/bin/initdb";
                    let child = spawn(initdbPath, ["-D", dbDir], {
                        env: { "PGPORT":  socketNumber }
                    });
                    child.on("exit", async function () {
                        // rewrite the port in postgresql.conf
                        let config = dbDir + "/postgresql.conf";
                        let file = await fs.readFileAsync(config);
                        let output = file.replace(/^#port = .*/gm, 'port = ' + socketNumber);
                        await fs.writeFileAsync(config, output);
                    });
                    child.stdout.pipe(process.stdout);
                    child.stderr.pipe(process.stderr);
                }
            }
            catch (e) {
                console.log("db error", e);
            }
        });

        // And send back the response
        response.sendStatus(204);
    });

    // Standard app callback stuff
    let appCallback = opts.appCallback;
    if (typeof(appCallback) === "function") {
        appCallback(app);
    }

    let listener = app.listen(portToListen, "localhost", async function () {
        let port = listener.address().port;

        let listenerCallback = opts.listenerCallback;
        if (typeof(listenerCallback) === "function") {
            listenerCallback(listener.address());
        }

        console.log("listening on ", port);
        let keepieUrl = "http://localhost:8009/keepie/myservice/request";
        let receiptUrl = "http://localhost:" + port + "/pg/keepie-secret/"
        let keepieResponse = await fetch(keepieUrl,{
            method: "POST",
            headers: { "X-Receipt-Url": receiptUrl }
        });
        console.log("status", keepieResponse.status);
    });
};

exports.boot(5000);

// server.js ends here
