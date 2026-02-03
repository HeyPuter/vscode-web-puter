#!/bin/sh
zip vscode.app.zip $( find -not -path "./http.js" -not -path "./package.sh" -not -path "vscode.app.zip" -not -path "./node_modules/*" -not -path "./myDav/node_modules/*" -not -path "./.git/*" && find "./node_modules/vscode-web" )
