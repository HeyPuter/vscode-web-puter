import * as Comlink from "https://unpkg.com/comlink/dist/esm/comlink.mjs";

Comlink.expose(puter);

window.sharedObject = {};

navigator.serviceWorker.register("./sw.js", {scope: "/"});

async function getFolderPath() {
    console.log("recieved a request from the heavens to get a file picker, obliging");
    return (await puter.ui.showDirectoryPicker()).path.replace("~", "/" + (puter.whoami || await puter.getUser()).username);
}
async function getFilePath() {
    return (await puter.ui.showFilePicker()).path.replace("~", "/" + (puter.whoami || await puter.getUser()).username);
}
async function ensureAuth() {
    if (!puter.authToken) {
        await ensureAuth();
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

if (navigator.serviceWorker.controller) {
    initComlink();
} else {
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