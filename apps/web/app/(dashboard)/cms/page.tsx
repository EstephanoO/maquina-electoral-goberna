"use client";

/**
 * CMS page — thin orchestrator (~200 lines).
 * All state/logic lives in use-cms-state.ts.
 * All pure helpers in utils.ts.
 * All CSS in cms-styles.ts.
 */

import { useCallback } from "react";
import {
  ChatContactListItem,
  ChatConversationPane,
  ContactNotesPanel,
  CmsTagFilter,
} from "./_components";
import { useCmsState, TABS } from "./use-cms-state";
import { FONT, OPEN_MOBILE_SIDEBAR_EVENT } from "./utils";
import { CMS_PAGE_STYLES } from "./cms-styles";

export default function CmsPage() {
  const cms = useCmsState();

  const handleOpenMobileSidebar = useCallback(() => {
    window.dispatchEvent(new Event(OPEN_MOBILE_SIDEBAR_EVENT));
  }, []);

  if (!cms.activeCampaignId) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Selecciona una campana para ver los contactos.
      </div>
    );
  }

  return (
    <div
      className="cms-page-root"
      style={{
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - 64px)",
        height: "calc(100dvh - 64px)",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <div className={`cms-chat-root ${cms.panelOpen ? "panel-open" : ""}`}>
        <div className={`cms-chat-shell ${cms.mobileChatOpen ? "mobile-chat-mode" : "mobile-list-mode"}`}>
          {/* ── Sidebar (contact list) ─────────────────────────── */}
          <aside className={`cms-chat-sidebar ${cms.mobileChatOpen ? "is-hidden-mobile" : ""}`}>
            <div className="cms-chat-sidebar-head" style={{ padding: "12px 12px 10px", borderBottom: "1px solid #eef2f7" }}>
              {/* Search + mobile menu */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <button
                  type="button"
                  className="cms-mobile-menu-btn"
                  onClick={handleOpenMobileSidebar}
                  aria-label="Abrir menu"
                  title="Abrir menu"
                  style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: "var(--goberna-blue-900)", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.22)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><title>Menu</title><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input
                    type="text"
                    placeholder="Buscar o iniciar chat"
                    value={cms.search}
                    onChange={(e) => cms.handleSearchChange(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: "1px solid #d6dde6", background: "#f8fafc", color: "#0f172a", fontSize: 14, outline: "none", fontFamily: FONT }}
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="cms-chat-tabs-row" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, overflowX: "auto", overflowY: "hidden", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                {TABS.map((tab) => {
                  const count = tab.statKey && cms.stats ? cms.stats[tab.statKey] : undefined;
                  const isActive = cms.activeTab === tab.key;
                  return (
                    <button
                      className="cms-chat-tab-btn"
                      key={tab.key}
                      type="button"
                      onClick={() => cms.setActiveTab(tab.key)}
                      style={{ border: "none", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: FONT, background: isActive ? "#0f172a" : "#eef2f7", color: isActive ? "#ffffff" : "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {tab.label}
                      {count !== undefined && (
                        <span style={{ fontSize: 11, lineHeight: 1, padding: "3px 6px", borderRadius: 999, background: isActive ? "rgba(255, 255, 255, 0.2)" : "#dbe3ec", color: isActive ? "#ffffff" : "#334155" }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tag filter */}
              <CmsTagFilter
                availableTags={cms.availableTags}
                selectedTagFilter={cms.selectedTagFilter}
                setSelectedTagFilter={cms.setSelectedTagFilter}
                onCreateTag={cms.handleCreateTag}
              />
            </div>

            {/* Contact list */}
            <div className="cms-chat-contact-list" ref={cms.contactListRef}>
              {cms.loading ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b", fontSize: 13 }}>Cargando contactos...</div>
              ) : cms.filteredContacts.length === 0 ? (
                <div style={{ padding: 22, textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {cms.search || cms.selectedTagFilter !== "__all" ? "Sin resultados para los filtros aplicados" : "No hay contactos en este filtro"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    {cms.search || cms.selectedTagFilter !== "__all" ? "Prueba con otra búsqueda o etiqueta" : "Los contactos aparecen cuando ingresan formularios"}
                  </div>
                </div>
              ) : (
                cms.filteredContacts.map((contact) => (
                  <ChatContactListItem
                    key={contact.id}
                    contact={contact}
                    selected={cms.selectedContactId === contact.id}
                    lastMessage={cms.latestMessageByContact[contact.id]}
                    onSelect={cms.handleSelectContact}
                    onOpenProfile={cms.setNotesContact}
                  />
                ))
              )}
              {!cms.loading && cms.contacts.length < cms.total && (
                <div ref={cms.loadMoreSentinelRef} style={{ height: 1 }} />
              )}
              {!cms.loading && cms.loadingMore && (
                <div style={{ padding: "8px 12px", textAlign: "center", fontSize: 12, color: "#64748b" }}>Cargando mas contactos...</div>
              )}
            </div>

            {/* Footer */}
            <div className="cms-chat-sidebar-footer" style={{ padding: "10px 12px", borderTop: "1px solid #eef2f7", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {cms.filteredContacts.length} visibles · {cms.contacts.length} cargados de {cms.total}
              </span>
            </div>
          </aside>

          {/* ── Chat pane ──────────────────────────────────────── */}
          <section className={`cms-chat-main ${!cms.mobileChatOpen ? "is-hidden-mobile" : ""}`}>
            <ChatConversationPane
              contact={cms.selectedContact}
              messages={cms.selectedMessages}
              loadingMessages={cms.selectedMessagesLoading}
              messagesError={cms.selectedMessagesError}
              draft={cms.selectedDraft}
              sending={cms.selectedSending}
              onOpenProfile={cms.setNotesContact}
              onDraftChange={cms.handleDraftChange}
              onSend={cms.handleSendMessage}
              onRefreshMessages={cms.handleRefreshMessages}
              onArchiveContact={cms.handleArchiveContact}
              archiving={Boolean(cms.selectedContactId && cms.archivingContactId === cms.selectedContactId)}
              contactTags={cms.selectedContactTags}
              availableTags={cms.availableTags}
              onCreateTag={cms.handleCreateTag}
              onAssignTag={cms.handleAssignTag}
              onRemoveTag={cms.handleRemoveTag}
              showMobileBackButton={cms.mobileChatOpen}
              onBackToList={cms.handleBackToContactList}
            />
          </section>
        </div>
      </div>

      {/* Notes panel */}
      {cms.notesContact && (
        <ContactNotesPanel
          contact={cms.notesContact}
          onSave={cms.handleSaveNotes}
          onClose={() => cms.setNotesContact(null)}
          saving={cms.savingNotes}
        />
      )}

      {/* Error toast */}
      {cms.uiError && (
        <button
          type="button"
          style={{
            position: "fixed",
            bottom: 24,
            right: cms.panelOpen ? 400 + 32 + 24 : 24,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.15)",
            zIndex: 9999,
            transition: "right 240ms ease",
            cursor: "pointer",
          }}
          onClick={() => cms.setUiError(null)}
          aria-label="Cerrar error"
        >
          {cms.uiError}
        </button>
      )}

      <style>{CMS_PAGE_STYLES}</style>
    </div>
  );
}
