import React from "react";

import { POINTER_EVENTS, sceneCoordsToViewportCoords } from "@excalidraw/common";
import {
  getElementAbsoluteCoords,
  getExcalidrawZMathData,
  isElementInViewport,
  isExcalidrawZMathElement,
  isImageElement,
} from "@excalidraw/element";

import { pencilIcon } from "./icons";

import type {
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

type ElementHoverAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

const requestMathImageEdit = (
  element: ExcalidrawImageElement,
  files: BinaryFiles,
) => {
  const mathData = getExcalidrawZMathData(element) as Record<
    string,
    any
  > | null;
  const fileData = element.fileId ? files[element.fileId] : null;

  window.excalidrawZHelper?.sendMessage({
    event: "requestEditMathImage",
    data: {
      elementId: element.id,
      fileId: element.fileId,
      latex: mathData?.latex ?? null,
      renderer: mathData?.renderer ?? null,
      version: mathData?.version ?? null,
      mathData,
      customData: element.customData,
      bounds: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
      angle: element.angle,
      fileData,
    },
  });
};

const getElementHoverActions = ({
  element,
  files,
}: {
  element: ExcalidrawElement;
  files: BinaryFiles;
}): ElementHoverAction[] => {
  const actions: ElementHoverAction[] = [];

  if (isImageElement(element) && isExcalidrawZMathElement(element)) {
    actions.push({
      key: "edit-math",
      label: "Edit formula",
      icon: pencilIcon,
      onSelect: () => requestMathImageEdit(element, files),
    });
  }

  return actions;
};

export const hasElementHoverActions = (element: ExcalidrawElement | null) => {
  return (
    !!element && isImageElement(element) && isExcalidrawZMathElement(element)
  );
};

export const ElementHoverActions = ({
  element,
  appState,
  elementsMap,
  files,
  onPointerLeave,
}: {
  element: ExcalidrawElement;
  appState: AppState;
  elementsMap: NonDeletedSceneElementsMap;
  files: BinaryFiles;
  onPointerLeave: () => void;
}) => {
  const actions = getElementHoverActions({ element, files });

  if (
    actions.length === 0 ||
    !isElementInViewport(
      element,
      appState.width,
      appState.height,
      appState,
      elementsMap,
    )
  ) {
    return null;
  }

  const [, y1, x2] = getElementAbsoluteCoords(element, elementsMap);
  const { x, y } = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y1 },
    appState,
  );

  return (
    <div
      className="excalidraw__element-hover-actions"
      style={{
        left: `${x - appState.offsetLeft + 8}px`,
        top: `${y - appState.offsetTop - 40}px`,
        pointerEvents: POINTER_EVENTS.enabled,
      }}
      onPointerLeave={onPointerLeave}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="excalidraw__element-hover-action"
          aria-label={action.label}
          title={action.label}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            action.onSelect();
          }}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
};
