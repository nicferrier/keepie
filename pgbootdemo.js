// Demo of using pgBoot - a keepie client - to start a server and initialize it
// The sql scripts use to initialze are kept in sql-scripts in this repository
// Copyright (C) 2018 by Nic Ferrier, ferrier.nic@gmail.com

const pgBoot = require("./server.js").pgBoot;
const path = require("path");

pgBoot.boot(8004, {
    dbDir: path.join(__dirname, "dbfiles"),

    sqlScriptsDir: path.join(__dirname, "sql-scripts"),

    pgPoolConfig: {
        max: 3,
        idleTimeoutMillis: 10 * 1000,
        connectionTimeoutMillis: 5 * 1000
    },

    appCallback: function (app) {
        app.set('json spaces', 4);

        // Dummy query function until we have a db up
        app.query = async function (sql, parameters) {
            throw new Error("no db connection yet");
        };

        // Listen for the dbUp event to receive the connection pool
        pgBoot.events.on("dbUp", async dbDetails => {
            let { pgPool } = dbDetails;

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
