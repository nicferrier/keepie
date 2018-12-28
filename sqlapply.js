// Setup the database from SQL files that hopefully are fully replayable

const { Pool } = require('pg')
const EventEmitter = require("events");
const fs = require("./fsasync.js");
const path = require("path");

Array.prototype.forEachAsync = async function (fn) {
    for (let t of this) { await fn(t) }
};

exports.events = new EventEmitter();

async function sqlApply (directory, client) {
    const dirExists = await fs.promises.exists(directory);
    if (dirExists) {
        let entries = await fs.promises.readdir(directory);
        let filtered = entries.filter(entry => !entry.endsWith("~") && !entry.startsWith("."));
        
        await filtered.forEachAsync(async entry => {
            let sqlFile = path.join(directory, entry);
            exports.events.emit("sqlFile", sqlFile);
            let file = await fs.promises.readFile(sqlFile);
            let statements = file.split("\n\n");
            let sqlToRun = statements.filter(statement => !statement.startsWith("--"));
            
            await sqlToRun.forEachAsync(async sql => {
                try {
                    // console.log("sqlapply", sqlFile, sql.substring(0, 40) + "...");
                    let res = await client.query(sql);
                }
                catch (e) {
                    console.log(
                        "keepie sqlapply - error doing",
                        sqlFile, sql, e
                    );
                }
            });
        });
    }
    return "hello";
}

exports.initDb = async function (directoryOrListOfDirectory, dbConfig) {
    const pool = new Pool(dbConfig);
    const client = await pool.connect();
    if (directoryOrListOfDirectory !== undefined) {
        try {
            if (typeof(directoryOrListOfDirectory) == "string") {
                await sqlApply(directoryOrListOfDirectory, client);
            }
            else if (typeof(directoryOrListOfDirectory) == "object"
                     && directoryOrListOfDirectory.filter !== undefined
                     && typeof(directoryOrListOfDirectory.filter) == "function") {
                await directoryOrListOfDirectory.forEachAsync(async singleDirectory => {
                    await sqlApply(singleDirectory, client)
                });
            }
        }
        finally {
            await client.release();
        }
    }
    return pool;
};

async function init(config, sqlScriptDir) {
    let client = await exports.initDb(sqlScriptDir, config);
    await client.end()
};

// end here
