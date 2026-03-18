/**
 * CMS page CSS — extracted from inline <style> in cms/page.tsx.
 * Consumed as a template literal by the page component.
 */

import { NOTES_PANEL_WIDTH, NOTES_PANEL_GAP, MOBILE_CHAT_BREAKPOINT_PX } from "./utils";

export const CMS_PAGE_STYLES = `
  .cms-chat-root {
    flex: 1;
    min-height: 0;
    height: 100%;
    transition: margin-right 240ms ease;
    overflow: hidden;
    max-width: 100vw;
  }

  .cms-chat-shell {
    width: 100%;
    max-width: 100vw;
    height: 100%;
    min-height: 0;
    border: 1px solid #d6dde6;
    border-radius: 16px;
    overflow: hidden;
    background: #f0f2f5;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    display: flex;
    transition: width 240ms ease;
  }

  .cms-chat-sidebar {
    width: min(380px, 100%);
    min-width: 320px;
    max-width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-right: 1px solid #d6dde6;
    overflow-x: hidden;
  }

  .cms-chat-contact-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background: #ffffff;
  }

  .cms-chat-main {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  @media (min-width: 1025px) {
    .cms-chat-root.panel-open .cms-chat-shell {
      width: calc(100% - ${NOTES_PANEL_WIDTH + NOTES_PANEL_GAP}px);
    }
  }

  @media (max-width: 1024px) {
    .cms-chat-shell {
      flex-direction: column;
      min-height: 0;
    }
    .cms-chat-sidebar {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      border-right: none;
      border-bottom: 1px solid #d6dde6;
      max-height: min(48dvh, 420px);
    }
    .cms-chat-main {
      min-height: 0;
    }
  }

  @media (max-width: ${MOBILE_CHAT_BREAKPOINT_PX}px) {
    .cms-page-root {
      min-height: 100dvh !important;
      height: 100dvh !important;
    }
    .cms-chat-root {
      height: 100%;
    }
    .cms-chat-shell {
      height: 100%;
      width: 100%;
      max-width: 100vw;
      border: none;
      border-radius: 0;
      box-shadow: none;
      background: #ffffff;
    }
    .cms-mobile-menu-btn {
      display: inline-flex !important;
    }
    .cms-chat-sidebar.is-hidden-mobile,
    .cms-chat-main.is-hidden-mobile {
      display: none;
    }
    .cms-chat-shell.mobile-list-mode .cms-chat-sidebar {
      max-height: none;
      height: 100%;
      border-bottom: none;
    }
    .cms-chat-sidebar-head {
      padding: 10px 10px 8px !important;
    }
    .cms-chat-tabs-row {
      gap: 6px !important;
      padding-bottom: 4px !important;
      scrollbar-width: none;
    }
    .cms-chat-tabs-row::-webkit-scrollbar {
      display: none;
    }
    .cms-chat-tab-btn {
      padding: 6px 10px !important;
      font-size: 11px !important;
    }
    .cms-chat-sidebar-footer {
      display: none !important;
    }
    .cms-chat-shell.mobile-chat-mode {
      height: 100%;
    }
    .cms-chat-shell.mobile-chat-mode .cms-chat-main {
      height: 100%;
    }
  }

  @media (min-width: ${MOBILE_CHAT_BREAKPOINT_PX + 1}px) {
    .cms-mobile-menu-btn {
      display: none !important;
    }
  }

  @keyframes tagDropdownIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
