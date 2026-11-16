// If you change this, also change it in options.js
var defaultcolorjson = {
  ".*LLC.*": "Orange",
  ".*acqa.*": "Purple",
  ".*dasdigitalplatform-dev.*": "mediumpurple",
  ".*dasdigitalplatform-?(?!dev).*": "darkolivegreen",
  ".*gov.*": "blue",
  ".*prime.*": "Orange",
  ".*prod.*": "darkred"
};

window.addEventListener("load", function () {
  const { hostname, pathname } = window.location;
  if (hostname.endsWith(".awsapps.com") && (pathname.startsWith("/start") || pathname.startsWith("/directory"))) {
    // AWS SSO portal
    saveDataOnSSOAppExpansion();
    console.debug("Detected AWS SSO portal, saving account names and profiles.");
  } else if (
    hostname.includes("console.aws.amazon.com") ||
    hostname.includes("console.amazonaws-us-gov.com") ||
    hostname.includes("health.aws.amazon.com")
  ) {
    // AWS Console (including PHD)
    changeConsoleHeaderAndFooter();
    console.debug("Detected AWS Console, changing header and footer.");
  }
});

// Helper function for waiting until an element selection has been rendered.
function onElementReady(selectorFn, fn) {
  console.debug("Waiting for element to be ready...");
  let timedOut = false;
  setTimeout(function () {
    timedOut = true;
  }, 30000);
  const waitForElement = function () {
    if (timedOut) {
      fn(new Error("Element selection timed out."));
      return;
    }
    const selection = selectorFn();
    //console.debug("Element selection:", selection);
    const firstEl = Array.isArray(selection) ? selection[0] : selection;
    firstEl
      ? fn(undefined, selection)
      : window.requestAnimationFrame(waitForElement);
  };
  waitForElement();
}

function saveDataOnSSOAppExpansion() {
  // The access portal renders accounts as table rows. Each row has a name cell
  // ([data-testid=account-list-cell]) and a federation link
  // ([data-testid=account-federation-link]) whose href carries account_id.
  const accountRowsSelector = () =>
    Array.from(document.querySelectorAll("[data-testid=account-list-cell]"));
  console.debug("Waiting for AWS account list to be ready...");
  onElementReady(accountRowsSelector, function (err) {
    if (err) {
      console.error(err);
      return;
    }
    console.debug("AWS account list is ready, saving account names.");
    saveAccountNames();

    // Re-scrape when the table changes (pagination, filtering, refresh).
    let debounce;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(saveAccountNames, 500);
    }).observe(document.body, { childList: true, subtree: true });
  });
}

function extractAccountId(row) {
  const link = row.querySelector("a[data-testid=account-federation-link]");
  if (!link) return null;
  const match = (link.getAttribute("href") || "").match(/account_id=(\d{12})/);
  if (match) return match[1];
  const text = link.innerText.replaceAll("-", "").trim();
  return /^\d{12}$/.test(text) ? text : null;
}

let lastSavedAccounts = "";

function saveAccountNames() {
  const accountMap = {};
  for (const cell of document.querySelectorAll("[data-testid=account-list-cell]")) {
    const row = cell.closest("tr");
    if (!row) continue;
    const name = cell.innerText.trim();
    const accountId = extractAccountId(row);
    if (name && accountId) {
      accountMap[accountId] = name;
    }
  }

  const serialized = JSON.stringify(accountMap);
  if (Object.keys(accountMap).length === 0 || serialized === lastSavedAccounts) {
    return;
  }
  lastSavedAccounts = serialized;
  console.debug("Saving accounts:", accountMap);

  chrome.runtime.sendMessage(
    { method: "saveSSOData", data: accountMap },
    function () {
      console.log(`Saved ${Object.keys(accountMap).length} accounts to storage for Console augmentation.`);
    }
  );
}

function changeConsoleHeaderAndFooter() {
  console.debug("Changing AWS Console header and footer...");
  const consoleFederatedLoginPattern = /AWSReservedSSO_(.+)_(.+)/;
  // show AWS SSO data to AWS console header
  chrome.runtime.sendMessage({ method: "getSSOData" }, function (response) {
    if (!response) {
      console.warn("Cannot color AWS Console. Please open your AWS Start page so I can scrape the AWS Account Names and Ids", response)
      return;
    }
    const accountMap = response.data;
    console.debug("Retrieved account map from backend:", accountMap);
    const labelSelector = () =>
      document.querySelector(
        "span[data-testid='awsc-nav-account-menu-button']"
      );

    onElementReady(labelSelector, function (err, label) {
      if (err) {
        // console.warn("Ending SSO title update attempts.");
        return;
      }

      label = label.querySelector("span");

      const accountIdDivSelector = () =>
        document.querySelector("div[data-testid='account-detail-menu']");

      onElementReady(accountIdDivSelector, function (err, accountIdDiv) {
        if (err) {
          return;
        }

        const accountIds = accountIdDiv.querySelectorAll("span");

        var accountId = "";
        const isNumberRegexp = new RegExp(/^[0-9]+(\.[0-9]+)?$/);
        for (span of accountIds) {
          const accountIdTmp = span.innerText.replaceAll("-", "");
          if (isNumberRegexp.test(accountIdTmp) && accountIdTmp.length == 12) {
            accountId = accountIdTmp;
            break;
          }
        }
        if (!accountId) {
          return;
        }

        var roleName = "";
        for (span of accountIds) {
          const accountDetail = span.innerText
            .split("/")[0]
            .match(consoleFederatedLoginPattern);
          if (accountDetail && accountDetail.length > 1) {
            roleName = accountDetail[1];
            break;
          }
        }
        if (!roleName) {
          return;
        }

        const accountName = accountMap[accountId];
        const text = `SSO: ${roleName} @ ${accountName} (${accountId})`;
        label.innerText = text;

        chrome.storage.local.get("ce_aws_sso_colors", function (items) {
          var colors = defaultcolorjson;
          if (items.ce_aws_sso_colors) {
            colors = items.ce_aws_sso_colors;
          }
          for (var regexp in colors) {
            re = new RegExp(regexp);
            console.debug(`Checking if account name ${accountName} matches RegEx: ${regexp}`);
            if (re.test(accountName)) {
              const headerSelector = () =>
                document.querySelector("header").querySelector("nav");
              onElementReady(headerSelector, function (err, header) {
                if (err) {
                  return;
                }
                header.style.backgroundColor = colors[regexp];
              });
              const footerSelector = () =>
                document.querySelector("div[id='console-nav-footer-inner']");
              onElementReady(footerSelector, function (err, footer) {
                if (err) {
                  return;
                }
                footer.style.backgroundColor = colors[regexp];
              });
            }
          }
        });
      });
    });
  });
}
