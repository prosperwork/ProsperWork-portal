import type { ReactNode } from "react";

type WorkspacePageFrameProps = {
  children: ReactNode;
  pathname: string;
};

/**
 * One shared structural frame for authenticated workspaces. Route modules keep
 * ownership of their records, permissions, actions, and meaningful sections;
 * this frame provides a stable page canvas and content measure around them.
 */
export default function WorkspacePageFrame({ children, pathname }: WorkspacePageFrameProps) {
  return (
    <div className="workspace-page-frame" data-workspace-route={pathname}>
      <div className="workspace-page-content">{children}</div>
    </div>
  );
}
