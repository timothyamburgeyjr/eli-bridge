import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { C } from "@/constants/theme";
import { usePeople, Person } from "@/people/PeopleStore";
import { resolveOrCreateProfilePath } from "@/people/profileLinker";
import { PersonEnrollModal } from "./PersonEnrollModal";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PeopleRoster({ visible, onClose }: Props) {
  const byId = usePeople((s) => s.byId);
  const removePerson = usePeople((s) => s.removePerson);
  const addPerson = usePeople((s) => s.addPerson);
  const findByName = usePeople((s) => s.findByName);
  const people = Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRelationship, setNewRelationship] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      setAddError("Enter a name");
      return;
    }

    const existing = findByName(name);
    if (existing) {
      // Don't create a duplicate — jump straight to enrolling the existing one
      setAddError(null);
      setAdding(false);
      setNewName("");
      setNewRelationship("");
      setEnrollingId(existing.id);
      return;
    }

    const created = addPerson({
      name,
      relationship: newRelationship.trim() || undefined,
      voiceEmbedding: null,
      faceEmbedding: null,
    });

    // Background: find or create their Obsidian profile page, attach the path
    resolveOrCreateProfilePath(name)
      .then((resolved) => {
        if (!resolved) return;
        usePeople.getState().updatePerson(created.id, {
          obsidianPath: resolved.path,
        });
      })
      .catch((err) => {
        console.warn("[profileLinker] async resolve failed:", err);
      });

    setAddError(null);
    setAdding(false);
    setNewName("");
    setNewRelationship("");
    setEnrollingId(created.id);
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName("");
    setNewRelationship("");
    setAddError(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
          <Text style={styles.title}>People</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {adding ? (
            <View style={styles.addCard}>
              <Text style={styles.addTitle}>New person</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Name (e.g. Charlie)"
                placeholderTextColor={C.muted}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                style={styles.addInput}
                returnKeyType="next"
              />
              <TextInput
                value={newRelationship}
                onChangeText={setNewRelationship}
                placeholder="Relationship (optional) — e.g. coworker"
                placeholderTextColor={C.muted}
                autoCapitalize="sentences"
                autoCorrect={false}
                style={styles.addInput}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              {addError ? <Text style={styles.addError}>⚠ {addError}</Text> : null}
              <View style={styles.addBtnRow}>
                <Pressable onPress={cancelAdd} style={styles.cancelBtn}>
                  <Text style={{ color: C.muted, fontSize: 13 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleCreate}
                  style={[styles.createBtn, !newName.trim() && { opacity: 0.4 }]}
                  disabled={!newName.trim()}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                    Create + enroll
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.addHint}>
                An Obsidian profile page will be auto-linked (or created) in
                08 - Elias Reed/LiveMode/Profiles/.
              </Text>
            </View>
          ) : (
            <Pressable onPress={() => setAdding(true)} style={styles.addEntryBtn}>
              <Text style={{ color: C.accent, fontSize: 14, fontWeight: "600" }}>
                + New person
              </Text>
            </Pressable>
          )}

          {people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              onRemove={() => removePerson(p.id)}
              onEnroll={() => setEnrollingId(p.id)}
            />
          ))}
          <Text style={styles.footer}>
            Enroll a person by tapping Enroll on their row — samples stay on-device
            and are used only for on-device voice/face identification. Samples
            taken here are NOT sent to Eli.
          </Text>
        </ScrollView>
      </View>

      <PersonEnrollModal
        visible={enrollingId !== null}
        personId={enrollingId}
        onClose={() => setEnrollingId(null)}
      />
    </Modal>
  );
}

function PersonRow({
  person,
  onRemove,
  onEnroll,
}: {
  person: Person;
  onRemove: () => void;
  onEnroll: () => void;
}) {
  const voiceStatus = person.voiceEmbedding
    ? `✅ voice enrolled`
    : person.pendingVoiceSamples.length > 0
    ? `⏳ ${person.pendingVoiceSamples.length}/3 voice samples`
    : `○ no voice`;
  const faceStatus = person.faceEmbedding ? `✅ face enrolled` : `○ no face`;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{person.name}</Text>
        {person.relationship ? (
          <Text style={styles.relationship}>{person.relationship}</Text>
        ) : null}
        {person.notes ? (
          <Text style={styles.notes}>{person.notes}</Text>
        ) : null}
        <View style={styles.statusRow}>
          <Text style={styles.statusItem}>{voiceStatus}</Text>
          <Text style={styles.statusSep}>·</Text>
          <Text style={styles.statusItem}>{faceStatus}</Text>
        </View>
      </View>
      <View style={styles.actionCol}>
        <Pressable onPress={onEnroll} style={styles.enrollBtn}>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>Enroll</Text>
        </Pressable>
        {person.id !== "tim" ? (
          <Pressable onPress={onRemove} style={styles.removeBtn}>
            <Text style={{ color: C.red, fontSize: 12 }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  name: { fontSize: 15, fontWeight: "600", color: C.text },
  relationship: { fontSize: 12, color: C.muted, marginTop: 2 },
  notes: { fontSize: 12, color: C.textDim, marginTop: 6, lineHeight: 17 },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 6, alignItems: "center" },
  statusItem: { fontSize: 11, color: C.textDim },
  statusSep: { fontSize: 11, color: C.muted },
  actionCol: {
    gap: 6,
    alignItems: "stretch",
  },
  enrollBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.accent + "66",
    backgroundColor: C.accent + "14",
    alignItems: "center",
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.red + "44",
    alignItems: "center",
  },
  footer: {
    fontSize: 11,
    color: C.muted,
    marginTop: 20,
    lineHeight: 18,
    fontStyle: "italic",
  },
  addEntryBtn: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 11,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.accent + "77",
    backgroundColor: C.accent + "10",
  },
  addCard: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  addTitle: { fontSize: 13, fontWeight: "700", color: C.text },
  addInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: C.text,
  },
  addBtnRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  createBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.accent,
  },
  addError: { color: C.red, fontSize: 12 },
  addHint: { color: C.muted, fontSize: 11, lineHeight: 16, fontStyle: "italic" },
});
