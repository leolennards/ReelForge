"use client";

import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api";

import { JobsProvider } from "./jobs";
import { ThemeProvider, useTheme } from "./theme";
import { UploadsProvider } from "./uploads";

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-line-strong !bg-elevated !text-fg !shadow-2xl",
          description: "!text-muted",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false }}>
        <MotionConfig reducedMotion="user">
          <Tooltip.Provider>
            <JobsProvider>
              <UploadsProvider>{children}</UploadsProvider>
            </JobsProvider>
            <ThemedToaster />
          </Tooltip.Provider>
        </MotionConfig>
      </SWRConfig>
    </ThemeProvider>
  );
}
