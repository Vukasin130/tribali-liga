import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { configureCompetition, createCity, createCompetition, deleteCompetition, listCities, updateCompetition } from "../api/endpoints";
import type { City, Competition } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

type FormatType = "league" | "tournament";

export function LeagueComposerModal({
  competition: editingCompetition,
  onClose,
  onSaved,
  onDeleted
}: {
  competition?: Competition;
  onClose: () => void;
  onSaved: (competition: Competition) => void;
  onDeleted?: () => void;
}) {
  const isEditing = Boolean(editingCompetition);
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState(editingCompetition?.cityId || "");
  const [newCityName, setNewCityName] = useState("");
  const [addingCity, setAddingCity] = useState(false);
  const [name, setName] = useState(editingCompetition?.name || "");
  const [seasonName, setSeasonName] = useState(editingCompetition?.seasonName || "");
  const [format, setFormat] = useState<FormatType>("league");
  const [groupCount, setGroupCount] = useState("2");
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState("2");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listCities()
      .then((rows) => {
        setCities(rows);
        setCityId((current) => current || rows[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  async function handleAddCity() {
    if (!newCityName.trim()) return;
    setAddingCity(true);
    setError("");
    try {
      const city = await createCity({ name: newCityName.trim() });
      setCities((previous) => [...previous, city]);
      setCityId(city.id);
      setNewCityName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grad nije sacuvan.");
    } finally {
      setAddingCity(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Naziv lige je obavezan.");
      return;
    }
    if (!seasonName.trim()) {
      setError("Naziv sezone je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEditing && editingCompetition) {
        const competition = await updateCompetition(editingCompetition.id, {
          cityId: cityId || undefined,
          name: name.trim(),
          seasonName: seasonName.trim()
        });
        onSaved(competition);
        return;
      }

      const competition = await createCompetition({
        cityId: cityId || undefined,
        name: name.trim(),
        seasonName: seasonName.trim(),
        status: "active"
      });

      if (format === "tournament") {
        await configureCompetition(competition.id, {
          formatType: "tournament",
          phases: [
            {
              code: "group",
              name: "Grupna faza",
              type: "group",
              sequence: 1,
              legs: 1,
              groupCount: Number(groupCount) || 2,
              qualifiersPerGroup: Number(qualifiersPerGroup) || 2
            },
            { code: "knockout", name: "Nokaut faza", type: "knockout", sequence: 2, legs: 1 }
          ]
        });
      } else {
        await configureCompetition(competition.id, { formatType: "league" });
      }

      onSaved(competition);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liga nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingCompetition) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await deleteCompetition(editingCompetition.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liga nije obrisana.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isEditing ? "Izmeni ligu" : "Nova liga"}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Grad</Text>
            {cities.length > 0 ? (
              <View style={styles.chipsRow}>
                {cities.map((city) => (
                  <TouchableOpacity
                    key={city.id}
                    style={[styles.chip, cityId === city.id ? styles.chipActive : null]}
                    onPress={() => setCityId(city.id)}
                  >
                    <Text style={[styles.chipText, cityId === city.id ? styles.chipTextActive : null]}>{city.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={styles.newCityRow}>
              <TextInput
                style={[styles.input, styles.newCityInput]}
                placeholder="Novi grad"
                placeholderTextColor="#9c9186"
                value={newCityName}
                onChangeText={setNewCityName}
              />
              <TouchableOpacity style={styles.addCityButton} onPress={handleAddCity} disabled={addingCity}>
                <Text style={styles.addCityButtonText}>{addingCity ? "Cuvanje..." : "Dodaj"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Naziv lige (npr. Prva liga Novi Sad)"
            placeholderTextColor="#9c9186"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Naziv sezone (npr. Prolece 2026)"
            placeholderTextColor="#9c9186"
            value={seasonName}
            onChangeText={setSeasonName}
          />

          {!isEditing ? (
            <View style={styles.field}>
              <Text style={styles.label}>Format takmicenja</Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.chip, format === "league" ? styles.chipActive : null]}
                  onPress={() => setFormat("league")}
                >
                  <Text style={[styles.chipText, format === "league" ? styles.chipTextActive : null]}>Liga (svako sa svakim)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, format === "tournament" ? styles.chipActive : null]}
                  onPress={() => setFormat("tournament")}
                >
                  <Text style={[styles.chipText, format === "tournament" ? styles.chipTextActive : null]}>Turnir (grupe + nokaut)</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!isEditing && format === "tournament" ? (
            <View style={styles.row}>
              <View style={[styles.field, styles.flex1]}>
                <Text style={styles.label}>Broj grupa</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2"
                  placeholderTextColor="#9c9186"
                  keyboardType="number-pad"
                  value={groupCount}
                  onChangeText={setGroupCount}
                />
              </View>
              <View style={[styles.field, styles.flex1]}>
                <Text style={styles.label}>Prolazi po grupi</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2"
                  placeholderTextColor="#9c9186"
                  keyboardType="number-pad"
                  value={qualifiersPerGroup}
                  onChangeText={setQualifiersPerGroup}
                />
              </View>
            </View>
          ) : null}

          {!isEditing && format === "tournament" ? (
            <Text style={styles.hint}>
              Ekipe dodajes posle pravljenja lige. Kad ih ima dovoljno, iz admin panela redom pokrecas: raspored po grupama, raspored grupne faze, pa pripremu nokaut runde.
            </Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : isEditing ? "Sacuvaj izmene" : "Napravi ligu"} onPress={handleSave} loading={saving} />

          {isEditing ? (
            <TouchableOpacity
              style={[styles.deleteButton, confirmingDelete ? styles.deleteButtonConfirm : null]}
              onPress={handleDelete}
              disabled={deleting}
            >
              <Text style={[styles.deleteButtonText, confirmingDelete ? styles.deleteButtonTextConfirm : null]}>
                {deleting ? "Brisanje..." : confirmingDelete ? "Potvrdi brisanje lige" : "Obrisi ligu"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {confirmingDelete ? (
            <Text style={styles.hint}>
              Ovo trajno brise ligu, sve njene utakmice i tabelu. Ekipe u bazi ostaju netaknute. Pritisni ponovo da potvrdis.
            </Text>
          ) : null}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Otkazi</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  field: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  newCityRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  newCityInput: { flex: 1 },
  addCityButton: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  addCityButtonText: { color: colors.purple, fontWeight: "700" },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  deleteButton: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: "transparent"
  },
  deleteButtonConfirm: { backgroundColor: colors.danger },
  deleteButtonText: { color: colors.danger, fontWeight: "700" },
  deleteButtonTextConfirm: { color: "#fff" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
