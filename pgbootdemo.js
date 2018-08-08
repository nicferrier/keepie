// Demo of using pgBoot - a keepie client - to start a server and initialize it
// The sql scripts use to initialze are kept in sql-scripts in this repository
// Copyright (C) 2018 by Nic Ferrier, ferrier.nic@gmail.com

const pgBoot = require("./server.js").pgBoot;
const path = require("path");
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
    prompt: 'K> '
});


pgBoot.boot(8004, {
    dbDir: path.join(__dirname, "dbfiles"),

    sqlScriptsDir: path.join(__dirname, "sql-scripts"),

    pgPoolConfig: {
        max: 3,
        idleTimeoutMillis: 10 * 1000,
        connectionTimeoutMillis: 5 * 1000
    },

    listenerCallback: function (listenerAddress) {
        console.log("listening on", listenerAddress);
    },

    appCallback: function (app) {
        app.set('json spaces', 4);

        // Dummy query function until we have a db up
        app.query = async function (sql, parameters) {
            throw new Error("no db connection yet");
        };

        // Listen for the dbUp event to receive the connection pool
        pgBoot.events.on("dbUp", async dbDetails => {
            let { pgPool, psql } = dbDetails;

            // when we get the pool make a query method available
            app.query = async function (sql, parameters) {
                let client = await pgPool.connect();
                try {
                    let result = await client.query(sql, parameters);
                    return result;
                }
                catch (e) {
                    return {
                        dberror: e
                    };
                }
                finally {
                    client.release();
                }
            };

            app.psqlSpawn = psql;
        });

        pgBoot.events.on("dbPostInit", () => {
            let devCli = function() {
                rl.question("> ", (command) => {
                    console.log("got a command");
                    switch (command) {
                    case "psql":
                        app.psqlSpawn(devCli);
                        break;
                    case "help":
                        console.log("this is a simple cli allowing launching of psql");
                        devCli();
                        break;
                    default:
                        console.log("type help");
                        devCli();
                        break;
                    }
                });
            };
            devCli();
        });

        app.get("/status", async function (req, res) {
            let query = "SELECT * FROM nictest;";
            res.json({
                up: true,
                nictestRows: await app.query(query)
            });
        });
    }
});

// Ends here
