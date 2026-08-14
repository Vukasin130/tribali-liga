import React, { useEffect, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createGeneralSponsor, deleteGeneralSponsor, fetchAllGeneralSponsors, updateGeneralSponsor } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton } from "../components/ui";

export function SponsorsManagerModal({
  onClose,
  onChanged,
  initialEditing
}: {
  onClose: () => void;
  onChanged: () => void;
  initialEditing?: Sponsor | "new";
}) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Sponsor | "new" | null>(initialEditing ?? null);
  const isWide = useIsWideScreen();

  function load() {
    setLoading(true);
    setError("");
    fetchAllGeneralSponsors()
      .then(setSponsors)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam sponzore."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleSaved() {
    setEditing(null);
    load();
    onChanged();
  }

  if (editing) {
    return (
      <SponsorForm sponsor={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.iconButton} onPress={onClose}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.title}>Sponzori</Text>
            <View style={styles.iconButtonSpacer} />
          </View>
          <Text style={styles.subtitle}>
            Ovi sponzori se prikazuju zajedno kao traka logoa na vise mesta u aplikaciji.
          </Text>

          <PrimaryButton label="+ Novi sponzor" onPress={() => setEditing("new")} />

          {loading ? <LoadingState label="Ucitavanje..." /> : null}
          {error ? <ErrorState message={error} onRetry={load} /> : null}
          {!loading && sponsors.length === 0 ? <EmptyState message="Jos nema sponzora u ovoj listi." /> : null}

          {sponsors.map((sponsor) => (
            <TouchableOpacity key={sponsor.id} onPress={() => setEditing(sponsor)}>
              <Card style={styles.row}>
                <SponsorRowLogo logoUrl={sponsor.logoUrl} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{sponsor.title}</Text>
                  {sponsor.subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{sponsor.subtitle}</Text> : null}
                </View>
                <Pill label={sponsor.isActive ? "Aktivan" : "Neaktivan"} tone={sponsor.isActive ? "success" : "neutral"} />
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SponsorRowLogo({ logoUrl }: { logoUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" onError={() => setFailed(true)} />;
  }
  return <View style={[styles.logo, styles.logoPlaceholder]} />;
}

function SponsorForm({
  sponsor,
  onClose,
  onSaved
}: {
  sponsor: Sponsor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(sponsor);
  const [title, setTitle] = useState(sponsor?.title ?? "");
  const [subtitle, setSubtitle] = useState(sponsor?.subtitle ?? "");
  const [targetUrl, setTargetUrl] = useState(sponsor?.targetUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(sponsor?.logoUrl ?? "");
  const [isActive, setIsActive] = useState(sponsor?.isActive !== false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const isWide = useIsWideScreen();

  async function handlePickLogo() {
    setError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("logo");
      if (uploaded) {
        setLogoUrl(uploaded.url);
        setPhotoFailed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo nije otpremljen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Naziv sponzora je obavezan.");
      return;
    }
    if (!logoUrl) {
      setError("Logo je obavezan - u traci se prikazuje samo logo, bez teksta.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { title: title.trim(), subtitle: subtitle.trim(), logoUrl, targetUrl: targetUrl.trim(), isActive };
      if (isEditing && sponsor) {
        await updateGeneralSponsor(sponsor.id, payload);
      } else {
        await createGeneralSponsor(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sponzor nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!sponsor) return;
    setDeleting(true);
    setError("");
    try {
      await deleteGeneralSponsor(sponsor.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sponzor nije obrisan.");
      setDeleting(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>{isEditing ? "Izmeni sponzora" : "Novi sponzor"}</Text>

          {logoUrl && !photoFailed ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoPreview}
              resizeMode="contain"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <View style={[styles.logoPreview, styles.logoPlaceholder]} />
          )}
          <TouchableOpacity style={styles.pickButton} onPress={handlePickLogo} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : logoUrl ? "Promeni logo" : "Dodaj logo"}</Text>
          </TouchableOpacity>

          <TextInput style={styles.input} placeholder="Naziv sponzora (interno, ne prikazuje se)" placeholderTextColor="#9c9186" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Beleska (opciono)" placeholderTextColor="#9c9186" value={subtitle} onChangeText={setSubtitle} />
          <TextInput
            style={styles.input}
            placeholder="Link ka sponzoru (opciono)"
            placeholderTextColor="#9c9186"
            value={targetUrl}
            onChangeText={setTargetUrl}
            autoCapitalize="none"
          />

          {isEditing ? (
            <TouchableOpacity style={styles.activeToggle} onPress={() => setIsActive((current) => !current)}>
              <Ionicons name={isActive ? "checkbox" : "square-outline"} size={20} color={isActive ? colors.purple : colors.textMuted} />
              <Text style={styles.activeToggleText}>Aktivan (prikazuje se u traci)</Text>
            </TouchableOpacity>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj sponzora"} onPress={handleSave} loading={saving} />
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Otkazi</Text>
          </TouchableOpacity>

          {isEditing && sponsor ? (
            confirmingDelete ? (
              <View style={styles.deleteConfirmBox}>
                <Text style={styles.deleteConfirmText}>Obrisati "{sponsor.title}" trajno? Ovo se ne moze poništiti.</Text>
                <View style={styles.deleteConfirmRow}>
                  <TouchableOpacity
                    style={styles.deleteConfirmCancel}
                    onPress={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    <Text style={styles.cancelButtonText}>Otkazi</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteConfirmButton} onPress={handleDelete} disabled={deleting}>
                    <Text style={styles.deleteConfirmButtonText}>{deleting ? "Brisanje..." : "Da, obrisi"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.deleteButton} onPress={() => setConfirmingDelete(true)}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={styles.deleteButtonText}>Obrisi sponzora</Text>
              </TouchableOpacity>
            )
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  iconButtonSpacer: { width: 36, height: 36 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  logoPlaceholder: { backgroundColor: colors.surfaceMuted, borderRadius: 10 },
  logoPreview: { width: 96, height: 96, borderRadius: 16, alignSelf: "center", backgroundColor: "#fff" },
  rowTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  activeToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  activeToggleText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(160,24,61,0.3)",
    marginTop: 10
  },
  deleteButtonText: { color: colors.danger, fontWeight: "700" },
  deleteConfirmBox: {
    backgroundColor: "rgba(160,24,61,0.08)",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginTop: 10
  },
  deleteConfirmText: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  deleteConfirmRow: { flexDirection: "row", gap: 10 },
  deleteConfirmCancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  deleteConfirmButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.danger
  },
  deleteConfirmButtonText: { color: "#fff", fontWeight: "700" }
});
