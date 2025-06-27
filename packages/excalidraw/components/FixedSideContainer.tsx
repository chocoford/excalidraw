import React from "react";
import clsx from "clsx";

import "./FixedSideContainer.scss";

type FixedSideContainerProps = {
  children: React.ReactNode;
  side: "top" | "left" | "right";
  className?: string;
  style?: React.CSSProperties;
};

export const FixedSideContainer = ({
  children,
  side,
  className,
  style,
}: FixedSideContainerProps) => (
  <div
    className={clsx(
      "FixedSideContainer",
      `FixedSideContainer_side_${side}`,
      className,
    )}
    style={style}
  >
    {children}
  </div>
);
