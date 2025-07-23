const key = "chrome-aws-sso-data-v2";

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // This function may not be async!  
  if (request.method == "getSSOData") {
    chrome.storage.local.get(key, function(currentData){
        console.debug("Sending SSO data to content.js", currentData)
        sendResponse({data: currentData[key]});
    });
  } else if (request.method == "saveSSOData") {
    const newFoundAccounts = request.data;
    updateSSOData(newFoundAccounts);
    sendResponse("OK");
  } else {
    sendResponse({});
  }
  return true;
});


async function updateSSOData(newFoundAccounts){
  const numNewAccounts = Object.keys(newFoundAccounts).length;
    if(numNewAccounts <= 0){
      console.debug("No new accounts recieved? Is this an error?");
      return;
    }
    console.debug(`Updating/Inserting ${Object.keys(newFoundAccounts).length} accounts`, newFoundAccounts)
    let currentData = (await chrome.storage.local.get(key))[key];
    console.debug("Current data stored:", currentData);
    if(currentData == null || currentData == undefined){
      currentData = {};
    }

    for (const [key, value] of Object.entries(newFoundAccounts)) {
      currentData[key] = value;
    }

    let dataToStore = {};
    dataToStore[key] = currentData;

    await chrome.storage.local.set(dataToStore);
}