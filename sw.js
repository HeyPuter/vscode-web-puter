importScripts("https://unpkg.com/comlink@4.4.2/dist/umd/comlink.js");

let token = undefined;
let sharedObject = {};
let readyPromise = new Promise(res => {
    self.addEventListener('message', (event) => {
        if (event.data instanceof MessagePort) {
            sharedObject = Comlink.wrap(event.data);
            event.data.start();
            res();
        }
    });
})

let routes = {
    GET: {
        ['/syscall/getFilePicker']: async function (response) {
            await readyPromise;

        },

        ['/syscall/getFolderPicker']: async function(response) {
            await readyPromise;
            console.log("MORTAL's requested folder path");
            const thing = await sharedObject.getFolderPath();
            console.log("MORTAL's folder path: ", thing);
            return new Response(thing);
        },
        ['/syscall/getUsername']: async function (response) {
            await readyPromise;
            
            return new Response(await sharedObject.getUsername());
        },

        ['/syscall/getToken']: async function (response) {
            await readyPromise;
            const token = await sharedObject.puter.authToken;
            if (!token) {
                await sharedObject.ensureAuth();
            }
            return new Response(await sharedObject.puter.authToken);
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

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});