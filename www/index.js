async function sendSql() {
    let sql = document.querySelector("textarea").value;
    let form = new FormData();
    form.append("command", sql);
    let response = await fetch(document.location, {
        method: "POST",
        body: form
    });
    if (response.status != 200) {
        console.log("sendSql did not succeed", response.status, response);
        return;
    }
    let result = await response.json();
    console.log("sendSql result", result);
}

function initSqlArea() {
    let area = document.querySelector("textarea");
    area.addEventListener("keypress", keyEvt => {
        if (keyEvt.keyCode == 10 && keyEvt.ctrlKey) {
            sendSql();
            keyEvt.preventDefault();
        }
    });
}

const es = new EventSource("results");

es.addEventListener("meta", metaEvt => {
    console.log("meta", metaEvt);
});

es.addEventListener("result", resultEvt => {
    try {
        console.log("result", resultEvt);
    }
    catch (e) {
        console.log("error while handling resultEvt", e);
    }
});


window.addEventListener("load", evt => {
    initSqlArea();
});
