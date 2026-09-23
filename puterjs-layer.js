import * as Comlink from "https://unpkg.com/comlink/dist/esm/comlink.mjs";

window.sharedObject = {};

async function getFolderPath() {
    console.log("recieved a request from the heavens to get a file picker, obliging");
    return (await puter.ui.showDirectoryPicker()).path.replace("~", "/" + (puter.whoami || await puter.getUser()).username);
}
async function getFilePath() {
    return (await puter.ui.showFilePicker()).path.replace("~", "/" + (puter.whoami || await puter.getUser()).username);
}
async function ensureAuth() {
    if (!puter.authToken) {
        await puter.auth.signIn();
    }
}
async function getUsername() {
    await ensureAuth();
    return ((puter.whoami || await puter.getUser()).username);
}


function initComlink() {
    const channel = new MessageChannel();
    navigator.serviceWorker.controller.postMessage(channel.port2, [channel.port2]);
    Comlink.expose(sharedObject, channel.port1);
    channel.port1.start();
    sharedObject.hello = "hi";
    sharedObject.puter = puter;
    sharedObject.getFolderPath = getFolderPath;
    sharedObject.getFilePath = getFilePath;
    sharedObject.ensureAuth = ensureAuth;
    sharedObject.getUsername = getUsername;
    sharedObject.href = location.href;
    // console.log("shared object: ", _runInSW);
}

// The SW loses our port whenever the browser stops it for being idle; it asks for a new one
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === "requestPort" && navigator.serviceWorker.controller) {
        initComlink();
    }
});
navigator.serviceWorker.startMessages();

// Only reload once the worker is active. Reloading while register() is still in
// flight cancels it in WebKit (the page fetches the SW script), so an
// unconditional reload loops forever.
await navigator.serviceWorker.register("./sw.js", {scope: "/"});
if (navigator.serviceWorker.controller) {
    initComlink();
} else {
    await navigator.serviceWorker.ready;
    window.location.reload();
}


window.Comlink = Comlink;


navigator.serviceWorker.addEventListener('controllerchange', initComlink);


// navigator.serviceWorker.addEventListener("message", (event) => {
//     const message = event.data;
//     switch (message.op) {
//         case 'showFilePicker':
//             (async () => {
//                 const fsitem = await puter.ui.showOpenFilePicker();
//                 const resData = new FormData();
//                 resData.set("file", fsitem.path);
//                 resData.set("tag", event.data.tag);
//                 fetch("/syscalls/respondShowFilePicker", { method: "GET", body: resData });
//             })();

//             break;
//         case 'showFolderPicker':
//             (async () => {
//                 const fsitem = await puter.ui.showDirectoryPicker();
//                 const resData = new FormData();
//                 resData.set("folder", fsitem.path);
//                 resData.set("tag", event.data.tag);

//                 fetch("/syscalls/respondShowFolderPicker", { method: "GET", body: resData });
//             })();
//             break;
//         case 'getToken': 
//             (async () => {
//                 const resData = new FormData();
//                 resData.set("token", puter.authToken);
//                 resData.set("tag", event.data.tag);
//                 fetch("/syscalls/respondGetToken", { method: "GET", body: resData });
//             })();
//             break;
//     }
// })