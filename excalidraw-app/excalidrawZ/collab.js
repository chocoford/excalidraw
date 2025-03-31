import { sendMessage } from "./message";

export const getExcalidrawCollabInfo = () => {
  try {
    return JSON.parse(localStorage.getItem("excalidraw-collab"));
  } catch {
    return {};
  }
};

export const setExcalidrawCollabInfo = (payload) => {
  window.excalidrawZHelper.setCollabName?.(payload.username);
  // localStorage.setItem("excalidraw-collab", JSON.stringify(payload));
};

export const openCollabMode = async () => {
  const wait = async () =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    });

  const menuButton = document.querySelector("[data-testid=main-menu-trigger]");
  if (!menuButton) {
    return;
  }
  menuButton.click();

  await wait();

  const collabButton = document.querySelector("[data-testid=collab-button]");
  if (!collabButton) {
    return;
  }
  collabButton.click();

  await wait();

  const modalContainer = document.querySelector(".excalidraw-modal-container");

  if (!!window.location.hash) {
  } else {
    modalContainer.querySelector(".ExcButton")?.click();
    await wait();

    const nameField = modalContainer
      .querySelector(".ExcTextField")
      ?.querySelector("input");
    if (!!nameField) {
      nameField.value = "123";
      const event = new Event("change", { bubbles: true });
      nameField.dispatchEvent(event);
      nameField.blur();
    }

    // const linkField = modalContainer
    //   .querySelector(".ShareDialog__active__linkRow")
    //   ?.querySelector("input");

    sendMessage({
      event: "didOpenLiveCollaboration",
      data: {
        hash: window.location.hash,
        href: window.location.href,
      },
    });
  }
  await wait();
  modalContainer.querySelector(".Modal__background")?.click();
};

export const reportCollaborators = (collaborators) => {
  sendMessage({
    event: "onCollaboratorsChanged",
    data: collaborators,
  });
};

export const updateCollaborators = (collaborators) => {
  window.excalidrawZHelper.collaborators = collaborators;
  reportCollaborators(collaborators);
};

// export const followCollborator = (socketId: string) => {

// }
