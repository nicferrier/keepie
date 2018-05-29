// Setup the database from SQL files that hopefully are fully replayable

const { Pool } = require('pg')
const EventEmitter = require("events");
const fs = require("./fsasync.js");
const path = require("path");

exports.events = new EventEmitter();

Array.prototype.forEachAsync = async function (fn) {
    for (let t of this) { await fn(t) }
};

exports.initDb = async function (directory, dbConfig) {
    let pool = new Pool(dbConfig);
    let client = await pool.connect();

    if (directory !== undefined) {
        try {
            let entries = await fs.promises.readdir(directory);
            let filtered = entries.filter(entry => !entry.endsWith("~"));
            
            await filtered.forEachAsync(async entry => {
                let sqlFile = path.join(directory, entry);
                exports.events.emit("sqlFile", sqlFile);
                let file = await fs.promises.readFile(sqlFile);
                let statements = file.split("\n\n");
                let sqlToRun = statements.filter(statement => !statement.startsWith("--"));
                
                await sqlToRun.forEachAsync(async sql => {
                    try {
                        let res = await client.query(sql);
                        // console.log(sql, res.rows);
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
        finally {
            client.release();
        }
    }
    return pool;
};

async function init(config, sqlScriptDir) {
    let client = await exports.initDb(sqlScriptDir, config);
    await client.end()
};

// end here
