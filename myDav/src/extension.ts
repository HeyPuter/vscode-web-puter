import * as vscode from 'vscode';
import { FileStat, WebDAVClient, WebDAVClientOptions, WebDAVClientError, AuthType, createClient } from 'webdav';
import { parse } from 'date-fns';
import {Buffer} from "buffer"

let authToken: string|undefined = undefined;

async function getAuthToken(): Promise<string> {
    if (authToken) 
        return authToken;
    authToken = await fetch("/syscall/getToken").then(r=>r.text()) as string;
    return authToken;
}

globalThis.Buffer = Buffer;
console.log(Buffer)

const log = (message: string): void => outputChannel.appendLine(message);
let outputChannel: vscode.OutputChannel;


export function validationErrorsForUri(value: string): string | undefined {
    if (!value) {
        return 'Enter a WebDAV address';
    } else {
        try {
            if (!value.startsWith("/")) {
                return "Path must be absolute"
            }
        } catch {
            return 'Enter a valid URI';
        }
    }
}

export async function resetAuth() {
    let uris = (vscode.workspace.workspaceFolders || []).map(f => f.uri.toString()).filter(u => u.startsWith("webdav"));
    if (uris.length) {
        let uri = uris.length === 1 ? uris[0] : (await vscode.window.showQuickPick(uris, { placeHolder: "Which WebDAV to Authenticate to?" }));
        if (uri) {
            await configureAuthForUri(toBaseUri(vscode.Uri.parse(uri)));
        }
    } else {
        vscode.window.showInformationMessage("No WebDAVs folders can be found in the current Workspace");
    }
}

export async function openDefaultFolder() {
    console.log("opening defauilt");
    let uriValue = "https://dav.puter.com/" + await fetch("/syscall/getUsername").then(r=>r.text());
    let name = uriValue.split("/").pop()
    let webdavUri = vscode.Uri.parse(uriValue.trim().replace(/^http/i, 'webdav'));
    console.log("webdavuri: ", webdavUri);


    await configureAuthForUri(toBaseUri(webdavUri));

    vscode.workspace.updateWorkspaceFolders(
        0, 1,
        {
            uri: webdavUri,
            name: name?.trim() ?? webdavUri.authority,
        },
    );
}

export async function openWebdav() {
    let uriValue = await fetch("/syscall/getFolderPicker").then(r=>r.text());
    
    if (!uriValue) {
        return;
    } else {
        uriValue = "https://dav.puter.com" + uriValue
    }

    let webdavUri = vscode.Uri.parse(uriValue.trim().replace(/^http/i, 'webdav'));
    console.log("webdavuri: ", webdavUri);

    // let name = await vscode.window.showInputBox({
    //     placeHolder: 'Press ENTER to use default ...',
    //     value: webdavUri.authority,
    //     prompt: "Custom name for Remote WebDAV"
    // });

    let name = uriValue.split("/").pop()

    await configureAuthForUri(toBaseUri(webdavUri));

    vscode.workspace.updateWorkspaceFolders(
        0, 0,
        {
            uri: webdavUri,
            name: name?.trim() ?? webdavUri.authority,
        },
    );
}

export async function activate(context: vscode.ExtensionContext) {
    console.log("registering webdav workspace")
    context.subscriptions.push(
        outputChannel = vscode.window.createOutputChannel('WebDAV Workspaces')
    );
    outputChannel.hide();
    log('Initializing WebDAV extension...');
    log('Register provider for webdav schemes... ');

    secrets = context.secrets;
    state = context.globalState;

    for (let scheme of ['webdav', 'webdavs']) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(scheme, new WebDAVFileSystemProvider(), { isCaseSensitive: true })
        );
    }
    console.log("registering commands")

    log(`Register extension.remote.webdav.resetAuth command... `);
    context.subscriptions.push(vscode.commands.registerCommand('extension.remote.webdav.resetAuth', resetAuth));

    log(`Register extension.remote.webdav.open command... `);
    context.subscriptions.push(vscode.commands.registerCommand('extension.remote.webdav.open', openWebdav));
    console.log("doing the default folder")
    openDefaultFolder();
    outputChannel.appendLine('Extension has been initialized.');
}

export function deactivate() { }

export const toWebDAVPath = (uri: vscode.Uri): string =>
    uri.path?.trim() || "/";

export const toBaseUri = (uri: vscode.Uri): string =>
    vscode.Uri.parse(uri.toString().replace(/^webdav/i, "http")).with({ path: "", fragment: "", query: "" }).toString();

export type WebDAVAuthType = "None" | "Basic" | "Digest" | "Windows (SSPI)";
export interface AuthSettings {
    auth?: WebDAVAuthType,
    user?: string,
}

export let secrets: vscode.SecretStorage;
export let state: vscode.Memento;

export async function configureAuthForUri(uriKey: string): Promise<void> {
    delete connections[uriKey]; // The conections are keyed on the baseUri
    let authOptions = ["None", "Basic", "Digest"];

    let settings: AuthSettings = { 
        auth: "Basic" 
    };
    if (settings.auth === "Basic" || settings.auth === "Digest") {
        settings.user = "-token";
        let pass = await getAuthToken();
        await secrets.store(uriKey, pass);
    }
    await state.update(uriKey, settings);
}

export const connections: { [key: string]: Promise<WebDAVClient> } = {};

export class WebDAVFileSystemProvider implements vscode.FileSystemProvider {

    private readonly _eventEmitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;

    public constructor() {
        this._eventEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
        this.onDidChangeFile = this._eventEmitter.event;
    }

    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

    public async copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
        return await this.forConnection("copy", source, async webdav => {
            return await webdav.copyFile(toWebDAVPath(source), toWebDAVPath(destination));
        });
    }

    public async createDirectory(uri: vscode.Uri): Promise<void> {
        return await this.forConnection("createDirectory", uri, async webdav => {
            return await webdav.createDirectory(toWebDAVPath(uri));
        });
    }

    public async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
        return await this.forConnection("delete", uri, async webdav => {
            return await webdav.deleteFile(toWebDAVPath(uri));
        });
    }

    private async createClient(baseUri: string): Promise<WebDAVClient> {
        let options: WebDAVClientOptions = {};
        let settings = state.get<AuthSettings>(baseUri, {});
        if (settings.auth === "Basic" || settings.auth === "Digest") {
            let password = await secrets.get(baseUri);
            options = {
                authType: settings.auth === "Basic" ? AuthType.Password : AuthType.Digest,
                username: settings.user,
                password: password
            };
        } else if (settings.auth === "Windows (SSPI)") {
            options = { withCredentials: true }; // This is a signal to use SSPI
        }
        return createClient(baseUri, options);
    }

    private async forConnection<T>(operation: string, uri: vscode.Uri, action: (webdav: WebDAVClient) => Promise<T>): Promise<T> {
        log(`${operation}: ${uri}`);
        let baseUri = toBaseUri(uri);
        try {
            if (!connections[baseUri]) {
                connections[baseUri] = this.createClient(baseUri);
            }
            return await action(await connections[baseUri]);
        } catch (e) {
            log(`${e} for ${uri}`);
            switch ((e as WebDAVClientError).status) {
                case 401:
                    let message = await vscode.window.showWarningMessage(`Authentication failed for ${uri.authority}.`, "Authenticate");
                    if (message === "Authenticate") {
                        await configureAuthForUri(baseUri);
                    }
                    throw vscode.FileSystemError.NoPermissions(uri);
                case 403:
                    throw vscode.FileSystemError.NoPermissions(uri);
                case 404:
                    throw vscode.FileSystemError.FileNotFound(uri);
            }
            throw e;
        }
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return await this.forConnection("readDirectory", uri, async webdav => {
            let results = await webdav.getDirectoryContents(toWebDAVPath(uri), { deep: false }) as FileStat[];
            // Some WebDAV providers ignore the deep: false parameter and enumerate the whole tree, hence the filtering
            let contents = results.filter(f => `${uri.path.toLowerCase()}/${f.basename.toLowerCase()}`.replace("//", "/") === f.filename.toLowerCase());
            return contents.map(r => [r.basename, r.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File]);
        });
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return await this.forConnection("readFile", uri, async webdav => {
            return new Uint8Array(await (await fetch("https://dav.puter.com" + toWebDAVPath(uri), {headers: {"Authorization": "Bearer " + await getAuthToken()}})).arrayBuffer())
            // let body = await webdav.getFileContents(toWebDAVPath(uri));
            // if (typeof body === "string") {
            //     return Buffer.from(body, 'binary');
            // } else {
            //     return body;
            // }
        });
    }

    public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
        return await this.forConnection("rename", oldUri, async webdav => {
            await webdav.moveFile(toWebDAVPath(oldUri), toWebDAVPath(newUri));
        });
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return await this.forConnection("stat", uri, async webdav => {
            console.log("got stat from vscode: " + toWebDAVPath(uri));

            let props = await webdav.stat(toWebDAVPath(uri)) as FileStat;
            let lastmod = parse((props.lastmod ?? "").substring(5), "dd MM y HH:mm:ss", new Date()).getTime(); // Sun, 06 Nov 1994 08:49:37 GMT
            return {
                ctime: lastmod,
                mtime: lastmod,
                size: props.size,
                type: props.type === 'file' ? vscode.FileType.File : vscode.FileType.Directory,
            };
        });
    }

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return { dispose: () => { } };
    }

    public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
        return await this.forConnection("stat", uri, async webdav => {
            (await fetch ("https://dav.puter.com" + toWebDAVPath(uri), {method: "PUT", body: new Blob([content as BlobPart]), headers: {"Authorization": "Bearer " + await getAuthToken()}}))

            // await this.throwIfWriteFileIsNotAllowed(uri, options);
            // await webdav.putFileContents(toWebDAVPath(uri), content, { overwrite: options.overwrite });
        });
    }

    protected async throwIfWriteFileIsNotAllowed(uri: vscode.Uri, options: { create: boolean, overwrite: boolean }) {
        try {
            let stat = await this.stat(uri);
            if (stat.type === vscode.FileType.Directory) {
                throw vscode.FileSystemError.FileIsADirectory(uri);
            }

            if (!options.overwrite) {
                throw vscode.FileSystemError.FileExists(uri);
            }
        } catch {
            if (!options.create) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
        }
    }
}