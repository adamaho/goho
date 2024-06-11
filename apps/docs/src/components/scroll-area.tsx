import type { PropsWithChildren } from "react";

import {
  ScrollArea as RadixScrollArea,
  type ScrollAreaProps as RadixScrollAreaProps,
  ScrollAreaScrollbar as RadixScrollAreaScrollbar,
  ScrollAreaThumb as RadixScrollAreaThumb,
  ScrollAreaViewport as RadixScrollAreaViewport,
} from "@radix-ui/react-scroll-area";
import clsx from "clsx";

import "./scroll-area.css";

type ScrollAreaProps = {
  className?: string;
  type?: RadixScrollAreaProps["type"];
};

export function ScrollArea({
  className,
  children,
  type = "scroll",
}: PropsWithChildren<ScrollAreaProps>) {
  return (
    <RadixScrollArea className={clsx("wui-scroll-area", className)} type={type}>
      <RadixScrollAreaViewport className="wui-scroll-area-mask">
        <div className="wui-scroll-area-content">{children}</div>
      </RadixScrollAreaViewport>
      <RadixScrollAreaScrollbar
        orientation="vertical"
        className="wui-scroll-area-scrollbar"
      >
        <RadixScrollAreaThumb className="wui-scroll-area-thumb" />
      </RadixScrollAreaScrollbar>
    </RadixScrollArea>
  );
}
