import tl = require('azure-pipelines-task-lib/task');
const url = require('url');
const path = require('path');
import {getToken,requestVault} from './common/request';
import {exportJSONValues} from './common/utils';

async function run() {
	
	try {

		tl.setResourcePath(path.join(__dirname, 'task.json'));

		var strUrl = tl.getInput('strUrl', true);
		var ignoreCertificateChecks = tl.getBoolInput('ignoreCertificateChecks', true);

		var strKVEnginePath = tl.getInput('strKVEnginePath', true);
		var kvVersion = tl.getInput('kvVersion', true);
		var strSecretPath = tl.getInput('strSecretPath', false);
		var strPrefixType = tl.getInput('strPrefixType', true);
		var strVariablePrefix = tl.getInput('strVariablePrefix', false);

		if(!strSecretPath){
			strSecretPath = "";
		}
		if(!strVariablePrefix){
			strVariablePrefix = "";
		}

		console.log("[INFO] Vault URL : '" + strUrl + "'");

		getToken().then(async function(token) {

			console.log("[INFO] KV engine path : '" + strKVEnginePath + "'");
			console.log("[INFO] KV version : '" + kvVersion + "'");
			console.log("[INFO] Secret path : '" + strSecretPath + "'");
			console.log("[INFO] Variable prefix : '" + strVariablePrefix + "'");
			console.log(" ");

			if(strSecretPath.match(/.*\/$/)){
				browseEngineAndGetSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, strSecretPath, strPrefixType, strVariablePrefix).then(function(result) {
					tl.setResult(tl.TaskResult.Succeeded, "Wrapping successfull.");
				}).catch(function(err) {
					tl.setResult(tl.TaskResult.Failed, err);
					throw new Error(err);
				});	
			}
			else{
				getSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, strSecretPath, strPrefixType, strVariablePrefix).then(function(result) {
					tl.setResult(tl.TaskResult.Succeeded, "Wrapping successfull.");
				}).catch(function(err) {
					tl.setResult(tl.TaskResult.Failed, err);
					throw new Error(err);
				});	
			}

			

		}).catch(function(err) {
			tl.setResult(tl.TaskResult.Failed, err);
			throw new Error(err);
		});

	} catch (err) {
		tl.setResult(tl.TaskResult.Failed, err);
	}
	
}

async function browseEngineAndGetSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, strSecretPath, strPrefixType, strVariablePrefix){

	return new Promise(async (resolve, reject) => {

		var listURL = null;

		if(strSecretPath == "/"){
			strSecretPath = "";
		}
		else if(strSecretPath.match(/^\/.*/)){
			strSecretPath = strSecretPath.substr(1);
		}
		
		switch(kvVersion){
			case "v1":
				listURL	= url.resolve(strUrl,path.normalize('/v1/' + strKVEnginePath + '/' + strSecretPath));
				break;
			case "v2":
				listURL	= url.resolve(strUrl,path.normalize('/v1/' + strKVEnginePath + '/metadata/' + strSecretPath));
				break;
			default:
				throw new Error("KV version not supported. v1 or v2 are supported.");
		}

		console.log("[INFO] Browse engine URL requested : [LIST] '" + listURL + "'");

		requestVault(listURL, ignoreCertificateChecks, token, "LIST", null).then(async function(result) {

			var resultJSON = JSON.parse(result);

			for (var i = 0; i < resultJSON.data.keys.length; i++) {
				try{

					var newStrSecretPath = strSecretPath + "/" + resultJSON.data.keys[i];
					if(strSecretPath.match(/.*\/$/) || strSecretPath == ""){
						newStrSecretPath = strSecretPath + resultJSON.data.keys[i];
					}
					

					if(resultJSON.data.keys[i].match(/.*\/$/)){
						await browseEngineAndGetSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, newStrSecretPath, strPrefixType, strVariablePrefix);
					}
					else{
						await getSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, newStrSecretPath, strPrefixType, strVariablePrefix);
					}
				}
				catch(err){
					reject("Error during browsing engine. " + err);
				}
			}

			resolve(true);

		}).catch(function(err) {
			reject(err);
		});
	});

}

async function getSecrets(kvVersion, strUrl, ignoreCertificateChecks, token, strKVEnginePath, strSecretPath, strPrefixType, strVariablePrefix){

	var getURL = null;

	switch(strPrefixType){
		case "folder":
			strVariablePrefix = strSecretPath.replace("/","_");
			break;
		case "custom":
			strVariablePrefix = strVariablePrefix;
			break;
		case "none":
		default:
			strVariablePrefix = "";
	}

	switch(kvVersion){
		case "v1":
			getURL	= url.resolve(strUrl,path.normalize('/v1/' + strKVEnginePath + '/' + strSecretPath));
			break;
		case "v2":
			getURL	= url.resolve(strUrl,path.normalize('/v1/' + strKVEnginePath + '/data/' + strSecretPath));
			break;
		default:
			throw new Error("KV version not supported. v1 or v2 are supported.");
	}

	console.log("[INFO] Get secrets URL requested : [GET] '" + getURL + "'");

	return new Promise(async (resolve, reject) => {

		requestVault(getURL, ignoreCertificateChecks, token, "GET", null).then(async function(result) {

			var resultJSON = JSON.parse(result);

			try{
				switch(kvVersion){
					case "v1":
						await exportJSONValues(resultJSON.data, strVariablePrefix);
						break;
					case "v2":
						console.log("[INFO] Secret version : '" + resultJSON.data.metadata.version + "'");
						console.log("[INFO] Secret creation time : '" + resultJSON.data.metadata.created_time + "'");
						await exportJSONValues(resultJSON.data.data, strVariablePrefix);
						break;
					default:
						throw new Error("KV version not supported. v1 or v2 are supported.");
				}
			}
			catch(err){
				reject(err);
			}

			console.log(" ");
			resolve(true);

		}).catch(function(err) {
			reject(err);
		});

	});

}

run();