importScripts("https://unpkg.com/comlink@4.4.2/dist/umd/comlink.js");

let token = undefined;
let sharedObject = undefined;
let resolveReady;
let readyPromise = new Promise(res => resolveReady = res);

self.addEventListener('message', (event) => {
    if (event.data instanceof MessagePort) {
        sharedObject = Comlink.wrap(event.data);
        event.data.start();
        resolveReady();
    }
});

async function getSharedObject() {
    if (!sharedObject) {
        // A restarted SW has no port, and pages only send one on load, so ask for it
        for (const client of await self.clients.matchAll({ type: "window" })) {
            client.postMessage("requestPort");
        }
    }
    await readyPromise;
    return sharedObject;
}

let routes = {
    GET: {
        ['/syscall/getFilePicker']: async function (response) {
            const sharedObject = await getSharedObject();

        },

        ['/syscall/getFolderPicker']: async function(response) {
            const sharedObject = await getSharedObject();
            console.log("MORTAL's requested folder path");
            const thing = await sharedObject.getFolderPath();
            console.log("MORTAL's folder path: ", thing);
            return new Response(thing);
        },
        ['/syscall/getUsername']: async function (response) {
            const sharedObject = await getSharedObject();
            
            return new Response(await sharedObject.getUsername());
        },

        ['/syscall/getToken']: async function (response) {
            const sharedObject = await getSharedObject();
            const token = await sharedObject.puter.authToken;
            if (!token) {
                await sharedObject.ensureAuth();
            }
            return new Response(await sharedObject.puter.authToken);
        },
        ['/syscall/getOpenedFile']: async function (response) {
            const sharedObject = await getSharedObject();
            return new Response((new URL(await sharedObject.href).searchParams.get("puter.item.path") ?? '').replace("~", "/" + await sharedObject.getUsername()));
        }
    }
}

async function router( {/** @type {Request} */ request} ) {
    const pathname = new URL(request.url).pathname;
    return routes[request.method][pathname](request);
}

self.addEventListener("fetch", ( /** @type {FetchEvent} */event) => {
    if (new URL(event.request.url).pathname.startsWith("/syscall/"))
        event.respondWith(router(event));
})

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});