const WATCHED_URLS = [
  "https://phabricator.services.mozilla.com/differential/revision/edit/*/comment/",
];

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    let actionData;
    try {
      actionData = JSON.parse(
        details.requestBody.formData["editengine.actions"]
      );
    } catch (e) {}

    if (!actionData) {
      return;
    }

    browser.tabs.sendMessage(details.tabId, actionData);
  },
  {
    urls: WATCHED_URLS,
  },
  ["requestBody"]
);
