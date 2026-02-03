# VSCode for AnuraSW v2.1
This is a customized version of vscode-web which uses AnuraSW v2.1's WebDav share emulation feature to access the Anura filesystem.

### Customizations
myDav folder contains a slightly updated version of vscode-webdav which uses webdav v5 instead of v4 and does a few things in native fetch. It also doesn't ask for a webdav address, instead it just appends window.location.origin + "/dav/" to whichever anura path is selected in the file picker.

### Packaging
Only thing which needs to be built is the myDav extension. Running ./package.sh should do this for you and output an anura package file as ./vscode.app.zip