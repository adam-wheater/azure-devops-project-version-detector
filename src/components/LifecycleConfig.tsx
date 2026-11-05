import * as React from "react";
import { VersionBadge } from "./VersionBadge";
import { LtsPill } from "./LifecycleTable";
import { Banner, Button, Card, ConfirmDialog, Pill } from "./ui";
import {
  FrameworkLifecycle,
  LifecycleConfigEntry,
  LifecycleConfigDocument,
  LifecycleStatus,
} from "../models/types";
import {
  mergeWithDefaults,
  buildConfigDocument,
  saveConfig,
  deleteConfig,
  makeKey,
  entriesToLifecycleData,
} from "../services/LifecycleConfigService";
import { getDefaultLifecycleData, computeStatus } from "../lifecycle/DotNetLifecycle";

interface LifecycleConfigProps {
  configDocument: LifecycleConfigDocument | null;
  /**
   * Called after a save or reset with the resolved lifecycle data and the
   * document now stored (null after a reset), so the parent can pass the
   * current document back in the next time this tab mounts.
   */
  onConfigSaved: (entries: FrameworkLifecycle[], document: LifecycleConfigDocument | null) => void;
}

const EMPTY_NEW_ENTRY = {
  framework: "",
  version: "",
  displayName: "",
  releaseDate: "",
  endOfLifeDate: "",
  isLts: false,
};

type PendingConfirm = { kind: "remove"; entry: LifecycleConfigEntry } | { kind: "resetAll" } | null;

export function LifecycleConfig({ configDocument, onConfigSaved }: LifecycleConfigProps) {
  const defaults = React.useMemo(() => getDefaultLifecycleData(), []);

  const [entries, setEntries] = React.useState<LifecycleConfigEntry[]>(() =>
    mergeWithDefaults(defaults, configDocument)
  );
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editValues, setEditValues] = React.useState<Partial<LifecycleConfigEntry>>({});
  const [saving, setSaving] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newEntry, setNewEntry] = React.useState(EMPTY_NEW_ENTRY);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm>(null);

  const grouped = React.useMemo(() => {
    const groups: Record<string, LifecycleConfigEntry[]> = {};
    for (const entry of entries) {
      if (!groups[entry.framework]) groups[entry.framework] = [];
      groups[entry.framework].push(entry);
    }
    return groups;
  }, [entries]);

  const startEdit = (entry: LifecycleConfigEntry) => {
    setEditingKey(entry.key);
    setEditValues({
      displayName: entry.displayName,
      releaseDate: entry.releaseDate,
      endOfLifeDate: entry.endOfLifeDate,
      isLts: entry.isLts,
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValues({});
  };

  const applyEdit = (key: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.key !== key) return e;
        const updated: LifecycleConfigEntry = {
          ...e,
          displayName: editValues.displayName ?? e.displayName,
          releaseDate: editValues.releaseDate ?? e.releaseDate,
          endOfLifeDate: editValues.endOfLifeDate ?? e.endOfLifeDate,
          isLts: editValues.isLts ?? e.isLts,
          isModified: !e.isCustom ? true : e.isModified,
        };
        updated.status = computeStatus(updated);
        return updated;
      })
    );
    setEditingKey(null);
    setEditValues({});
    setHasUnsavedChanges(true);
    setSaveMessage(null);
  };

  const addNewEntry = () => {
    const framework = newEntry.framework.trim();
    const version = newEntry.version.trim();
    const displayName = newEntry.displayName.trim();
    if (!framework || !version || !displayName) return;
    const key = makeKey(framework, version);
    if (entries.some((e) => e.key === key)) {
      // This used to do nothing at all, which read as a broken button.
      setSaveMessage({
        text: `${framework} ${version} is already in the list. Edit that entry instead.`,
        isError: true,
      });
      return;
    }

    const base = { ...newEntry, framework, version, displayName };
    const entry: LifecycleConfigEntry = {
      ...base,
      status: computeStatus({ ...base, status: LifecycleStatus.Supported }),
      key,
      isCustom: true,
      isModified: false,
    };
    setEntries((prev) => [...prev, entry]);
    setNewEntry(EMPTY_NEW_ENTRY);
    setShowAddForm(false);
    setHasUnsavedChanges(true);
    setSaveMessage(null);
  };

  const deleteEntry = (key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    setHasUnsavedChanges(true);
    setSaveMessage(null);
  };

  const resetEntry = (key: string) => {
    const def = defaults.find((d) => makeKey(d.framework, d.version) === key);
    if (!def) return;
    setEntries((prev) =>
      prev.map((e) => {
        if (e.key !== key) return e;
        return {
          ...def,
          status: computeStatus(def),
          key,
          isCustom: false,
          isModified: false,
        };
      })
    );
    setHasUnsavedChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const doc = buildConfigDocument(entries, defaults);
      await saveConfig(doc);
      onConfigSaved(entriesToLifecycleData(entries), doc);
      setHasUnsavedChanges(false);
      setSaveMessage({ text: "Configuration saved.", isError: false });
    } catch (err: any) {
      setSaveMessage({ text: `Failed to save: ${err?.message ?? String(err)}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await deleteConfig();
      const fresh = mergeWithDefaults(defaults, null);
      setEntries(fresh);
      onConfigSaved(defaults, null);
      setHasUnsavedChanges(false);
      setSaveMessage({ text: "Reset to defaults.", isError: false });
    } catch (err: any) {
      setSaveMessage({ text: `Failed to reset: ${err?.message ?? String(err)}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = () => {
    const pending = pendingConfirm;
    setPendingConfirm(null);
    if (pending?.kind === "remove") deleteEntry(pending.entry.key);
    if (pending?.kind === "resetAll") void handleResetAll();
  };

  return (
    <div>
      <p className="ax-muted ax-section">
        Manage .NET lifecycle data. Changes are shared across all users in this organization.
        Modified or custom entries will override the built-in defaults.
      </p>

      <div className="ax-toolbar">
        <Button
          variant="primary"
          onClick={handleSave}
          busy={saving}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button onClick={() => setPendingConfirm({ kind: "resetAll" })} disabled={saving}>
          Reset All to Defaults
        </Button>
        <Button onClick={() => setShowAddForm(!showAddForm)} aria-expanded={showAddForm}>
          {showAddForm ? "Cancel" : "+ Add Version"}
        </Button>
        {hasUnsavedChanges && <Pill tone="warn">Unsaved changes</Pill>}
      </div>

      {saveMessage && (
        <div className="ax-section">
          <Banner
            tone={saveMessage.isError ? "error" : "success"}
            onDismiss={() => setSaveMessage(null)}
          >
            {saveMessage.text}
          </Banner>
        </div>
      )}

      {showAddForm && (
        <Card title="Add a version">
          <div className="ax-form-grid">
            <label className="ax-field">
              <span className="ax-label">Framework</span>
              <input
                className="ax-input"
                value={newEntry.framework}
                onChange={(e) => setNewEntry({ ...newEntry, framework: e.target.value })}
                placeholder=".NET"
              />
            </label>
            <label className="ax-field">
              <span className="ax-label">Version</span>
              <input
                className="ax-input"
                value={newEntry.version}
                onChange={(e) => setNewEntry({ ...newEntry, version: e.target.value })}
                placeholder="11.0"
              />
            </label>
            <label className="ax-field">
              <span className="ax-label">Display Name</span>
              <input
                className="ax-input"
                value={newEntry.displayName}
                onChange={(e) => setNewEntry({ ...newEntry, displayName: e.target.value })}
                placeholder=".NET 11"
              />
            </label>
            <label className="ax-field">
              <span className="ax-label">Release Date</span>
              <input
                type="date"
                className="ax-input"
                value={newEntry.releaseDate}
                onChange={(e) => setNewEntry({ ...newEntry, releaseDate: e.target.value })}
              />
            </label>
            <label className="ax-field">
              <span className="ax-label">End of Life</span>
              <input
                type="date"
                className="ax-input"
                value={newEntry.endOfLifeDate}
                onChange={(e) => setNewEntry({ ...newEntry, endOfLifeDate: e.target.value })}
              />
            </label>
            <div className="ax-field">
              <span className="ax-label">Support</span>
              <label className="ax-check">
                <input
                  type="checkbox"
                  checked={newEntry.isLts}
                  onChange={(e) => setNewEntry({ ...newEntry, isLts: e.target.checked })}
                />
                LTS
              </label>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={addNewEntry}
            disabled={
              !newEntry.framework.trim() || !newEntry.version.trim() || !newEntry.displayName.trim()
            }
          >
            Add
          </Button>
        </Card>
      )}

      {Object.entries(grouped).map(([framework, groupEntries]) => (
        <Card key={framework} title={framework} flush>
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Release Date</th>
                  <th>End of Life</th>
                  <th>LTS</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupEntries.map((entry) => {
                  const isEditing = editingKey === entry.key;
                  return (
                    <tr key={entry.key}>
                      <td>
                        {isEditing ? (
                          <input
                            className="ax-input ax-input--sm pvd-edit-input"
                            aria-label="Display name"
                            value={editValues.displayName ?? ""}
                            onChange={(e) =>
                              setEditValues({ ...editValues, displayName: e.target.value })
                            }
                          />
                        ) : (
                          <strong>{entry.displayName}</strong>
                        )}
                      </td>
                      <td className={isEditing ? undefined : "ax-muted"}>
                        {isEditing ? (
                          <input
                            type="date"
                            className="ax-input ax-input--sm pvd-edit-input"
                            aria-label="Release date"
                            value={editValues.releaseDate ?? ""}
                            onChange={(e) =>
                              setEditValues({ ...editValues, releaseDate: e.target.value })
                            }
                          />
                        ) : (
                          entry.releaseDate
                        )}
                      </td>
                      <td className={isEditing ? undefined : "ax-muted"}>
                        {isEditing ? (
                          <input
                            type="date"
                            className="ax-input ax-input--sm pvd-edit-input"
                            aria-label="End of life date"
                            value={editValues.endOfLifeDate ?? ""}
                            onChange={(e) =>
                              setEditValues({ ...editValues, endOfLifeDate: e.target.value })
                            }
                          />
                        ) : (
                          entry.endOfLifeDate || "OS lifecycle"
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <label className="ax-check">
                            <input
                              type="checkbox"
                              checked={editValues.isLts ?? false}
                              onChange={(e) =>
                                setEditValues({ ...editValues, isLts: e.target.checked })
                              }
                            />
                            LTS
                          </label>
                        ) : (
                          <LtsPill isLts={entry.isLts} />
                        )}
                      </td>
                      <td>
                        <VersionBadge status={entry.status} />
                      </td>
                      <td>
                        {entry.isCustom ? (
                          <Pill tone="info">Custom</Pill>
                        ) : entry.isModified ? (
                          <Pill tone="warn">Modified</Pill>
                        ) : (
                          <span className="ax-muted">Default</span>
                        )}
                      </td>
                      <td className="pvd-actions">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => applyEdit(entry.key)}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(entry)}
                              aria-label={`Edit ${entry.displayName}`}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                if (!entry.isCustom) {
                                  // Built-in entry: require confirmation
                                  setPendingConfirm({ kind: "remove", entry });
                                } else {
                                  deleteEntry(entry.key);
                                }
                              }}
                              aria-label={`Delete ${entry.displayName}`}
                            >
                              Delete
                            </Button>
                            {entry.isModified && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => resetEntry(entry.key)}
                                aria-label={`Reset ${entry.displayName} to default`}
                              >
                                Reset
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <ConfirmDialog
        isOpen={pendingConfirm?.kind === "remove"}
        title="Remove built-in entry?"
        message={
          pendingConfirm?.kind === "remove"
            ? `${pendingConfirm.entry.displayName} will be removed from the lifecycle data for everyone in this organization when you save. You can bring it back later with Reset All to Defaults.`
            : ""
        }
        confirmLabel="Remove"
        danger
        onConfirm={confirmPending}
        onCancel={() => setPendingConfirm(null)}
      />
      <ConfirmDialog
        isOpen={pendingConfirm?.kind === "resetAll"}
        title="Reset all lifecycle data to defaults?"
        message="This deletes the saved lifecycle configuration for everyone in this organization and restores the built-in dates. Custom entries are removed."
        confirmLabel="Reset"
        danger
        onConfirm={confirmPending}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
