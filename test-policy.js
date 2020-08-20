const TYPES = {
  ACCEPT: "accept",
  PROJECT_TAG: "projectPHIDs",
};
const ACCEPT_TYPE = "accept";

// We don't have access to the project tag label directly, so we need to retrieve their ids
// We re-use the URL that the project tag autocomplete is using (using Phabricator API requires a token).
var projectTagsIdsPromise = fetch(
  "https://phabricator.services.mozilla.com/typeahead/class/PhabricatorProjectDatasource/?q=testing-&__ajax__=true"
)
  .then((res) => res.text())
  .then((responseText) => {
    try {
      // The reponse isn't valid JSON, but does contain JSON.
      var data = JSON.parse(responseText.substring(responseText.indexOf("{")));
      // Each project tag is represented by an array, the id is at index 2.
      const ids = data.payload.map((p) => p[2]);
      return ids;
    } catch (e) {
      console.error(e);
      return [];
    }
  });

// The background script watches for network requests that phabricator sends when the user
// interact the form at the very bottom of the screen, which luckily sends the whole "state"
// of the review on each interaction.
browser.runtime.onMessage.addListener(async function onBackgroundMessage(
  request
) {
  const isAccepted = request.some((data) => data.type === TYPES.ACCEPT);
  const testingPolicyProjectIds = await projectTagsIdsPromise;
  const hasTestingPolicyProjectTag = request
    .filter((data) => data.type === TYPES.PROJECT_TAG)
    .some((data) =>
      data.value.some((projectId) =>
        testingPolicyProjectIds.includes(projectId)
      )
    );

  const container = document.querySelector(".phui-form-view");
  const actionBar = container.querySelector(".phui-comment-action-bar");
  const missingPolicyEl = container.querySelector(".missing-test-policy-tag");

  // If the revision is accepted, and there's no testing policy tag, we want to show a
  // message to the user.
  if (isAccepted && !hasTestingPolicyProjectTag) {
    // If it's already there, there's nothing to do
    if (missingPolicyEl) {
      return;
    }
    const missingTestingPolicyNotice = document.createElement("div");
    missingTestingPolicyNotice.classList.add(
      "phui-comment-action",
      "missing-test-policy-tag"
    );
    missingTestingPolicyNotice.style.backgroundColor = "#fdf3da";
    missingTestingPolicyNotice.style.color = "1px solid #4B4D51";
    missingTestingPolicyNotice.style.border = "1px solid #c9b8a8";
    missingTestingPolicyNotice.style.textAlign = "center";
    missingTestingPolicyNotice.style.padding = "12px";

    missingTestingPolicyNotice.innerText =
      "Please add a testing-policy project tag";
    actionBar.insertAdjacentElement("afterend", missingTestingPolicyNotice);

    // Show the project tag UI, if it's not already
    const select = actionBar.querySelector("select");
    if (!select.querySelector("option[value='projectPHIDs']").disabled) {
      select.value = "projectPHIDs";
      select.dispatchEvent(new Event("change"));
    }
  } else if (missingPolicyEl) {
    missingPolicyEl.remove();
  }
});
