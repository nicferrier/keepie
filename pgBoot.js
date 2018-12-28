// pgBoot.js - an example keepie "client" with a pg db
// Copyright (C) 2018 by Nic Ferrier

const fs = require('./fsasync.js');
const { URL } = require('url');
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const net = require('net');
const path = require("path");
const EventEmitter = require("events");

const FormData = require('form-data');
const fetch = require("node-fetch");
const express = require("express");
const bodyParser = require("body-parser");
const multer  = require('multer')
const sqlInit = require("./sqlapply.js");

const { Client } = require('pg'); // the pool is done by sql-apply.js

const app = express();
const upload = multer();


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

async function findPathDir(exe, pathVar) {
    pathVar = pathVar !== undefined ? pathVar : process.env["PATH"];
    let pathParts = pathVar.split(path.delimiter);    
    let existsModes = fs.constants.R_OK;
    let existing = await pathParts
        .filterAsync(async p => await fs.promises.access(p, existsModes));
    let lists = await existing.mapAsync(
        async p => [p, await fs.promises.readdir(p)]
    );
    let exePlaces = lists.filter(n => n[1].find(s => s==exe || s==exe + ".exe") !== undefined);
    if (exePlaces.length > 0) {
        let [place, list] = exePlaces[0];
        return place;
    }
}

function eventToHappen(eventFn) {
    return new Promise((resolve, reject) => {
        eventFn(resolve);
    });
}

function grep (regex, fn) {
    return new Transform({
        transform(chunk, encoding, callback) {
            let dataBuf = chunk.toString();
            dataBuf.split("\n").forEach(line => {
                let result = regex.exec(line);
                if (result != null) {
                    fn(result);
                }
            });
            this.push(dataBuf);
            callback();
        }
    });
}

// Recursively attempt connection until something works
let triesLimit = 10;
const upTestFn = async function (dbConfig, tries) {
    // console.log("testing connection dbconfig", dbConfig);
    let client = new Client(dbConfig);
    let result = await client.connect().catch(e => e);

    // console.log("testing connection r>", result);
    if (result instanceof(Error) && tries < triesLimit) {
        client.end();
        await new Promise((resolve, reject) => {
            setTimeout(_ => resolve([]), 500);
        });
        return await upTestFn(dbConfig, tries + 1);
    }
    
    let queryResult = await client.query("select 1;").catch(e => e);
    // console.log("testing connection qr>", queryResult);
    if (queryResult instanceof(Error) && tries < triesLimit) {
        client.end();
        await new Promise((resolve, reject) => {
            setTimeout(_ => resolve([]), 500);
        });
        return await upTestFn(dbConfig, tries + 1);
    }

    // .. Otherwise it worked but we still need to end the connection
    client.end();
    return true;
};

// Events that we might expose
exports.events = new EventEmitter();

async function startDb(pgPath, dbDir, startOrRun, password, sqlScriptsDir) {
    // Get a spare socket
    let listenerAddress = await getFreePort();
    let socketNumber = "" + listenerAddress.port;
                
    // rewrite the port in postgresql.conf
    const config = path.join(dbDir, "postgresql.conf");
    const file = await fs.promises.readFile(config);
    const portChanged = file.replace(
            /^[#]*port = .*/gm, "port = " + socketNumber
    );

    const runDir = path.join(dbDir, "/run");
    const sockDirChanged = portChanged.replace(
            /^[#]*unix_socket_directories = .*/gm,
        "unix_socket_directories = '" + runDir + "'"
    );

    const logLevelEnv = process.env["PGLOGLEVEL"];
    const logLevelChanged = logLevelEnv !== undefined && logLevelEnv.length > 0
          ? sockDirChanged.replace(/^[#]*log_min_messages = .*/gm,
                                   "log_min_messages = '" + logLevelEnv + "'")
          : sockDirChanged;
    
    await fs.promises.writeFile(config, logLevelChanged);
    await fs.promises.writeFile(path.join(dbDir,"port"), socketNumber);

    let postgresPath = path.join(pgPath, "postgres");
    let startChild = spawn(postgresPath, ["-D", dbDir]);
    startChild.stdout.pipe(process.stdout);
    startChild.stderr.pipe(process.stderr);    

    // Test the startup with real connections
    let dbConfig = {
        user: "postgres",
        host: "localhost",
        port: socketNumber,
        database: "postgres"
    };

    if (startOrRun == "run") {
        dbConfig.password = password;
    }
    
    // Wait a few seconds for the service to start
    upTestFn(dbConfig, 0).then(started => {
        if (!started) {
            console.log("db didn't come up in 5 seconds");
            process.exit(1);
        }
        startChild.emit("accepting", [null, "ready"]);
    });

    let onConnectAccept = proc => startChild.on("accepting", proc);
    let found = await eventToHappen(onConnectAccept);
    
    let [_, ready] = found;
    if (ready != "ready") {
        throw new Error("not ready");
    }

    console.log("the db is on", socketNumber);

    if (startOrRun == "start") {
        let client = new Client(dbConfig);
        let passwordSql = `ALTER ROLE postgres WITH PASSWORD '${password}';`;
        // console.log("setting the password to", password, passwordSql);
        await client.connect();
        let pwChangeResult = await client.query(passwordSql);
        dbConfig.password = password;
        // Now rewrite the auth file
        let hbaPath = path.join(dbDir, "pg_hba.conf");
        await fs.promises.rename(hbaPath, path.join(dbDir, "pg_hba.conf.original"));
        await fs.promises.writeFile(hbaPath, `# pg_hba
#local all all trust
host  all all 127.0.0.1/32 password
host  all all ::1/128      password\n`);
        // Make PG re-read the file
        let reloadSql = "SELECT pg_reload_conf();"; 
        let reloadResult = await client.query(passwordSql);
        await client.end();
        
        //startChild.kill("SIGHUP");
    }
    console.log("keepie-pgBoot:: initializing db SQL");

    sqlInit.events.on("sqlFile", evt => exports.events.emit("sqlFile", evt));
    let pgPool = await sqlInit.initDb(sqlScriptsDir, dbConfig);

    // Make a psql func so that the user has the option of starting psql on console
    let psqlFunc = function (onClose) {
        let psqlPath = path.join(pgPath, "psql");
        let args = ["-h", "localhost",
                    "-p", socketNumber,
                    "-U", "postgres",
                   "postgres"];
        let childProcess = spawn(psqlPath, args, {
            stdio: [    // "inherit", //maybe we should copy the env somehow
                0, "pipe", 2
            ],
            detached: false,
            env: Object.assign({
                "PSQL_EDITOR": process.env["PSQL_EDITOR"],
                "EMACS_SERVER_FILE": process.env["EMACS_SERVER_FILE"],
                "PAGER": process.env["PAGER"],
                "PGPASSWORD": password
            }, process.env)
        });
        childProcess.on("exit", onClose);
    };

    // Send the "db's up" event
    exports.events.emit("dbUp", {
        pgPool: pgPool,
        psql: psqlFunc,
        pgProcess: startChild
    });
    
    //await sqlInit.end();
    console.log("keepie-pgBoot:: db started and initialized on", socketNumber);

    // Send a final event
    exports.events.emit("dbPostInit", {});
}

async function makePg(serviceName, password, pgBinDir, dbDir, sqlScriptsDir) {
    // Do the postgres init after the response has gone back
    try {
        // Do Pg init
        let pgBinPath = process.env["PATH"];
        let exists = await fs.promises.access(pgBinDir, fs.constants.R_OK);
        if (exists) {
            pgBinPath = pgBinPath + path.delimiter + pgBinDir;
        }
        
        let pgExeRoot = await findPathDir("initdb", pgBinDir);

        if (pgExeRoot == undefined) {
            throw new Error("cant find postgres initdb");
        }
        
        let pgPath = path.join(pgExeRoot, "/initdb");
        let dbdirExists = await fs.promises.exists(dbDir);
        if (dbdirExists) {
            // Boot the db
            await startDb(pgExeRoot, dbDir, "run", password, sqlScriptsDir);
        }
        else {
            let listenerAddress = await getFreePort();
            let socketNumber = "" + listenerAddress.port;

            // You must supply a valid socket number
            let portEnv = Object.assign({"PGPORT": socketNumber}, process.env);
            let env = { env: portEnv };

            let initdbPath = pgPath;
            console.log("keepie pgBoot initdbPath", initdbPath);
            let child = spawn(initdbPath, [
                "-D", dbDir, "-E=UTF8", "--locale=C", "-U", "postgres"
            ], env);
            child.stdout.pipe(process.stdout);
            child.stderr.pipe(process.stderr);

            let onExit = proc => child.on("exit", proc);
            await eventToHappen(onExit);

            let runDir = path.join(dbDir, "/run");
            fs.promises.mkdir(runDir);

            // Boot it!
            await startDb(pgExeRoot, dbDir, "start", password, sqlScriptsDir);
        }
    }
    catch (e) {
        console.log("keepie pg -- db error", e);
    }
}

const ubuntuPgPath = "/usr/lib/postgresql/10/bin";
const rhelPgPath = "/usr/pgsql-10/bin";

// Return a bunch of guesses about where PG initdb (and so on) might be.
async function guessPgBin() {
    if (process.env["PGBIN"] != undefined
        && await fs.promises.exists(process.env["PGBIN"], fs.constants.R_OK)) {
        return process.env["PGBIN"];
    }

    if (process.env["PG_HOME"] != undefined
        && await fs.promises.exists(path.join(process.env["PG_HOME"], "bin"),
                                    fs.constants.R_OK)) {
        return path.join(process.env["PG_HOME"], "bin");
    }

    let exec = require("util").promisify(require("child_process").exec);

    // Might indicate Ubuntu usage
    let lsbExe = await findPathDir("lsb_release");
    if (lsbExe != undefined) {
        let { stdout, stderr } = await exec("lsb_release -a");
        if (stdout.indexOf("Ubuntu") > -1) {
            console.log("pgBoot running on an Ubuntu");
            return ubuntuPgPath;
        }
    }

    let isRhel = await fs.promises.exists("/etc/redhat-release", fs.constants.R_OK);
    if (isRhel) {
        let isPg = await fs.promises.exists(
            path.join(rhelPgPath, "initdb"), fs.constants.R_OK
        );
        if (isPg) {
            return rhelPgPath;
        }
    }

    // Might be a common Windows path
    let sandboxPg = path.join("/sandbox", "pgsql", "bin");
    let sandboxed = await findPathDir("pg_ctl", sandboxPg);
    if (sandboxed) {
        console.log("pgBoot possibly running on Windows");
        return sandboxPg;
    }
}

// A deferred holder contains a value that is not computed until
// valueOf ... we use it to ensure we can get the hostPort from the
// server after it's started
const DeferredHolder = function () {
    this.hostPort = undefined;
    this.setHost = function (hostPort) { this.hostPort = hostPort; };
};
DeferredHolder.prototype.valueOf = function () {
    const keepieUrlEnvValue = process.env["KEEPIEURL"];
    if (keepieUrlEnvValue !== undefined && keepieUrlEnvValue !== "") {
        return keepieUrlEnvValue;
    }
    return this.hostPort + "/keepie-request";
};


exports.boot = async function (portToListen, options) {
    const defaultKeepieUrl = new DeferredHolder();
    const {
        listenAddress,
        listenerCallback,
        appCallback,
        rootDir = path.join(__dirname, "/www"),
        secretPath = "/pg/keepie-secret",
        serviceName = "pg-demo",
        keepieUrl = defaultKeepieUrl,
        pgBinDir = await guessPgBin(),
        sqlScriptsDir = path.join(__dirname, "sql-scripts"),
        dbDir = path.join(__dirname, "dbdir"),
        pgPoolConfig = {
            max: 10,
            idleTimeoutMillis: 30 * 1000,
            connectionTimeoutMillis: 2 * 1000
        }
    } = options != undefined ? options : {};

    // Ensure we don't have keys we don't want
    Object.keys(pgPoolConfig).forEach(key => {
        if (["user", "host", "port"].includes(key)) {
            delete pgPoolConfig[key];
        }
    });
    
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));

    app.post(secretPath, upload.array(), async function (req, response) {
        let data = req.body;
        let { name, password } = data;
        console.log("received authorization for", name);
        if (name !== serviceName || password === undefined) {
            response.sendStatus(400);
            return;
        }

        // And send back the response
        response.sendStatus(204);
        let onFinish = finisher => response.on("finish", finisher);
        await eventToHappen(onFinish);

        // Now make the pg
        await makePg(name, password, pgBinDir, dbDir, sqlScriptsDir);

        // Standard app callback stuff
        if (typeof(appCallback) === "function") {
            await appCallback(app);
        }
    });

    app.post("/keepie-request", async function (req, response) {
        let receiptUrl = req.get("x-receipt-url");
        console.log("received internal keepie request to authorize", receiptUrl);
        let responseEnd = block => response.on("finish", block);
        response.sendStatus(204);
        await eventToHappen(responseEnd);

        console.log("keepie response ended - processing request");
        let fd = new FormData();
        fd.append("password", "Secret1234567!");
        fd.append("name", serviceName);
        let authorizationReceiptUrl = "http://localhost:" + app.port + secretPath;
        console.log("keepie authorization sending to", authorizationReceiptUrl);
        fd.submit(authorizationReceiptUrl);
    });

    let listener = app.listen(portToListen, listenAddress, async function () {
        let addr = listener.address();
        let hostToListen = addr.address == "::" ? "localhost" : addr.address;
        app.port = addr.port;

        if (typeof(listenerCallback) === "function") {
            listenerCallback(addr, listener);
        }

        console.log("keepie pg listening on ", app.port);

        const hostScheme = "http://" + hostToListen + ":" + addr.port;
        defaultKeepieUrl.setHost(hostScheme);
        const keepieUrlValue = keepieUrl.valueOf();

        // Where do we receive passwords from keepie?
        let passwordReceiptUrl = hostScheme + secretPath;

        // And get the keepie response
        console.log("fetching keepie auth from", keepieUrlValue, "to", passwordReceiptUrl);
        let keepieResponse = await fetch(keepieUrlValue,{
            method: "POST",
            headers: { "X-Receipt-Url": passwordReceiptUrl }
        });
        console.log("keepie status", keepieResponse.status);
    });

    return [app, listener];
};

if (require.main === module) {
    try {
        let port = parseInt(process.argv.slice(2)[0])
        exports.boot(port);
    }
    catch (e) {
        console.log("couldn't start... port?", e);
    }
}
else {
    // Required as a module; that's ok, exports will be fine.
}

// pg.js ends here
