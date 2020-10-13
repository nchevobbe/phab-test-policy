const TYPES = {
  ACCEPT: "accept",
  PROJECT_TAG: "projectPHIDs",
};
const ACCEPT_TYPE = "accept";

const projectTagsData = Array.from(
  document.querySelectorAll("data[data-javelin-init-kind=behaviors]")
)
  .map((d) => JSON.parse(d.getAttribute("data-javelin-init-data")))
  .find((data) => data["comment-actions"])
  ?.["comment-actions"].find(({ actions }) => actions?.projectPHIDs)?.actions
  ?.projectPHIDs;

// We don't have access to the project tag label directly, so we need to retrieve their ids
// We re-use the URL that the project tag autocomplete is using (using Phabricator API requires a token).
const src =
  projectTagsData?.spec?.config?.src ||
  "/typeahead/class/PhabricatorProjectDatasource/";

// The input doesn't have meaningful attribute data we could target, and worse, the same
// class is used for all the "type ahead" inputs (e.g. reviewers)
// Luckily, we might have some data in projectTagsData, where the markup that will be used
// for the project tag input is stored.
let dataMeta;
if (projectTagsData?.spec?.markup) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(projectTagsData.spec.markup, "text/html");
  dataMeta = doc.querySelector("[data-meta]").getAttribute("data-meta");
}

var projectTagsIdsPromise = fetch(
  `https://phabricator.services.mozilla.com${src}?q=testing-&__ajax__=true`
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

  // We need to check either the tag was added by the current session (which should be
  // reflected in the request object), or if already existed before this session (which
  // we do by checking if a testing tag is in the DOM).
  const hasTestingPolicyProjectTag =
    request
      .filter((data) => data.type === TYPES.PROJECT_TAG)
      .some((data) =>
        data.value.some((projectId) =>
          testingPolicyProjectIds.includes(projectId)
        )
      ) ||
    Array.from(
      document.querySelectorAll(
        ".phabricator-handle-tag-list-item .phui-tag-core"
      )
    )
      .map((e) => e.textContent)
      .some((t) => t.startsWith("testing-"));

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

      setTimeout(() => {
        let projectTagInputSelector = ".jx-tokenizer-input";
        // By default, let's retrieve the first input we find (so if we can't refine the
        // search, we'll have an input, that is likely to be the project tag one).
        let autocompleteEl = document.querySelector(projectTagInputSelector);

        // If we were able to retrieve a dataMeta value for the project tags
        if (dataMeta) {
          // The data-meta is set on a span which is a sibling of the input, so we query
          // from containers in order to find it.
          const container = Array.from(
            document.querySelectorAll(".jx-tokenizer-frame")
          ).find((el) => el.querySelector(`[data-meta="${dataMeta}"]`));
          // If we did find it, then we're going to try to retrieve the input in the container.
          if (container) {
            const input = container.querySelector(projectTagInputSelector);
            if (input) {
              autocompleteEl = input;
            }
          }
        }

        autocompleteEl.focus();
        autocompleteEl.value = "testing-";
        autocompleteEl.dispatchEvent(new Event("keydown"));
      }, 10);
    }
  } else if (missingPolicyEl) {
    missingPolicyEl.remove();
  }
});
