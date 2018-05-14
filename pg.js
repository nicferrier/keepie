// pg - an example keepie "client" with a pg db
// Copyright (C) 2018 by Nic Ferrier

const fs = require('./fsasync.js');
const { URL } = require('url');
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const net = require('net');

const fetch = require("node-fetch");
const express = require("express");
const bodyParser = require("body-parser");
const multer  = require('multer')

const { Client } = require('pg');
const sqlInit = require("./sqlapply.js");

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


Array.prototype.forEachAsync = async function (fn) {
    for (let t of this) { await fn(t) }
};

Array.prototype.mapAsync = async function (fn) {
    let result = [];
    for (let t of this) { result.push(await fn(t)); }
    return result;
};

Array.prototype.filterAsync = async function (fn) {
    let result = [];
    for (let t of this) {
        let include = await fn(t);
        if (include) {
            result.push(t);
        }
    }
    return result;
};

function eventToHappen(eventFn) {
    return new Promise((resolve, reject) => {
        eventFn(resolve);
    });
}

function grepper(testFunction) {
    return new Transform({
        transform(chunk, encoding, callback) {
            let dataBuf = chunk.toString();
            dataBuf.split("\n").forEachAsync(testFunction);
            this.push("pg.js::" + dataBuf);
            callback();
        }
    });
}

async function findPathDir(exe, path) {
    path = path !== undefined ? path : process.env["PATH"];
    console.log("exe", exe);
    let pathParts = path.split(":");
    let existsModes = fs.constants.R_OK;
    let existing = await pathParts
        .filterAsync(async p => await fs.existsAsync(p, existsModes));
    let lists = await existing.mapAsync(async p => [p, await fs.readdirAsync(p)]);
    let exePlaces = await lists
        .filterAsync(async n => n[1].find(s => s==exe) !== undefined);
    let [place, list] = exePlaces[0];
    return place;
}

async function startDb(pgPath, dbDir) {
    let postgresPath = pgPath + "/postgres";
    let grepping = grepper(async line => {
        let found = /is (ready) to accept connections/.exec(line);
        if (found !== undefined && found != null && found[1] == "ready") {
            let port = await fs.readFileAsync(dbDir + "/port");
            let config = {
                user: process.env["USER"],
                host: "localhost",
                port: port,
                database: "postgres"
            };
            sqlInit.initDb(__dirname + "/sql-scripts", config);
            //await sqlInit.end();
            console.log("are we done?");
        }
    });

    let startChild = spawn(postgresPath, ["-D", dbDir]);
    startChild.stdout.pipe(process.stdout);
    startChild.stderr
        .pipe(grepping)
        .pipe(process.stderr);
}

exports.boot = function (portToListen, options) {
    let opts = options != undefined ? options : {};
    let rootDir = opts.rootDir != undefined ? opts.rootDir : __dirname + "/www";
    let secretPath = opts.secretPath != undefined ? opts.secretPath : "/pg/keepie-secret/";

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));

    app.post(secretPath, upload.array(), async function (req, response) {
        let data = req.body;
        let { name, password } = data;
        if (name !== "myservice" || password === undefined) {
            response.sendStatus(400);
            return;
        }

        // And send back the response
        response.sendStatus(204);

        let onFinish = finisher => response.on("finish", finisher);
        await eventToHappen(onFinish);
        // Do the postgres init after the response has gone back
        try {
            // Do Pg init
            let ubuntuPgPath = "/usr/lib/postgresql/10/bin";
            let path = process.env["PATH"] + ":" + ubuntuPgPath;
            let pgExeRoot = await findPathDir("initdb", path);
            
            let pgPath = pgExeRoot + "/initdb";
            let dbDir = __dirname + "/dbdir";
            let dbdirExists = await fs.existsAsync(dbDir);
            if (dbdirExists) {
                // Boot the db
                startDb(pgExeRoot, dbDir);
            }
            else {
                // Get a spare socket
                let listenerAddress = await getFreePort();
                let socketNumber = "" + listenerAddress.port;
                console.log("socket number", socketNumber);
                
                let initdbPath = pgPath + "/initdb";
                let portEnv = { "PGPORT":  socketNumber };
                let env = { env: portEnv };
                let child = spawn(initdbPath, ["-D", dbDir], env);
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
                
                let onExit = proc => child.on("exit", proc);
                await eventToHappen(onExit);
                
                // rewrite the port in postgresql.conf
                let config = dbDir + "/postgresql.conf";
                let file = await fs.readFileAsync(config);
                let portChanged = file.replace(/^#port = .*/gm, 'port = ' + socketNumber);
                let runDir = dbDir + "/run";
                fs.mkdirAsync(runDir);
                let sockDirChanged = portChanged.replace(/^#unix_socket_directories = .*/gm, "unix_socket_directories = '" + runDir + "'");
                await fs.writeFileAsync(config, sockDirChanged);
                await fs.writeFileAsync(dbDir + "/port", socketNumber);
                
                // Boot it!
                startDb(pgExeRoot, dbDir);
            }
        }
        catch (e) {
            console.log("keepie pg -- db error", e);
        }
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

        console.log("keepie pg listening on ", port);
        opts.secretPath != undefined ? opts.secretPath : "/pg/keepie-secret/";

        let defaultKeepieUrl = "http://localhost:8009/keepie/myservice/request";
        let keepieUrl = opts.keepieUrl != undefined ? opts.keepieUrl : defaultKeepieUrl;

        // How do we work out the IP?
        let receiptUrl = "http://localhost:" + port + secretPath;

        let keepieResponse = await fetch(keepieUrl,{
            method: "POST",
            headers: { "X-Receipt-Url": receiptUrl }
        });
        console.log("status", keepieResponse.status);
    });
};


if (require.main === module) {
    exports.boot(5000); 
}
else {
    // Required as a module; that's ok, exports will be fine.
}

// pg.js ends here
