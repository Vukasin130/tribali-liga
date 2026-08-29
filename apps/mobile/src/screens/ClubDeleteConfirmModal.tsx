import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { deleteClub, fetchClubDeletionImpact } from "../api/endpoints";
import type { ClubDeletionImpact } from "../api/types";
import { Card, ErrorState, LoadingState, PrimaryButton } from "../components/ui";
import { colors } from "../theme/colors";

// Deletion itself is never blocked here - full admin discretion, on purpose - but the
// admin should never be surprised by what it actually touches, so this always shows
// real counts (summed across every season this club has played in - see
// getClubDeletionImpact) before the "Obrisi klub" button is even enabled.
export function ClubDeleteConfirmModal({
  clubId,
  clubName,
  onClose,
  onDeleted
}: {
  clubId: string;
  clubName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<ClubDeletionImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClubDeletionImpact(clubId)
      .then(setImpact)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam podatke o klubu."))
      .finally(() => setLoading(false));
  }, [clubId]);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteClub(clubId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brisanje nije uspelo.");
      setDeleting(false);
    }
  }

  const hasHistory = Boolean(
    impact && (impact.matchesPlayed > 0 || impact.rosterEntries > 0 || impact.playerSeasonStatsRows > 0 || impact.standingsRows > 0)
  );

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <Text style={styles.title}>Obrisi klub</Text>
          <Text style={styles.subtitle}>{clubName}</Text>

          {loading ? <LoadingState label="Ucitavanje..." /> : null}
          {error && !loading ? <ErrorState message={error} /> : null}

          {impact && !loading ? (
            <View style={styles.impactBox}>
              {impact.teamInstances > 1 ? (
                <Text style={styles.impactLine}>
                  Ovaj klub ima {impact.teamInstances} zapisa kroz razlicite sezone - svi ce biti obrisani zajedno.
                </Text>
              ) : null}
              {hasHistory ? (
                <>
                  <Text style={styles.warning}>Ovaj klub ima stvarnu istoriju:</Text>
                  {impact.matchesPlayed > 0 ? <Text style={styles.impactLine}>- {impact.matchesPlayed} odigranih utakmica (utakmica i rezultat ostaju, samo gube naziv ekipe)</Text> : null}
                  {impact.rosterEntries > 0 ? <Text style={styles.impactLine}>- {impact.rosterEntries} zapisa u rosterima (bice obrisani)</Text> : null}
                  {impact.playerSeasonStatsRows > 0 ? <Text style={styles.impactLine}>- {impact.playerSeasonStatsRows} zapisa statistike igraca po sezoni (bice obrisani)</Text> : null}
                  {impact.playerMatchStatsRows > 0 ? <Text style={styles.impactLine}>- {impact.playerMatchStatsRows} zapisa statistike igraca po mecu (bice obrisani)</Text> : null}
                  {impact.standingsRows > 0 ? <Text style={styles.impactLine}>- {impact.standingsRows} redova u tabelama (bice obrisani)</Text> : null}
                </>
              ) : (
                <Text style={styles.impactLine}>Ovaj klub nema odigranih utakmica niti statistike - bezbedno za brisanje.</Text>
              )}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Text style={styles.cancelLink} onPress={onClose}>Otkazi</Text>
            <PrimaryButton
              label={deleting ? "Brisanje..." : "Obrisi klub"}
              onPress={handleDelete}
              loading={deleting}
              disabled={loading || !impact}
              variant="danger"
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,20,20,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, gap: 12 },
  title: { color: colors.textPrimary, fontSize: 19, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontWeight: "700", marginTop: -8 },
  impactBox: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 14, gap: 6 },
  warning: { color: colors.danger, fontWeight: "800", fontSize: 13 },
  impactLine: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 18, marginTop: 4 },
  cancelLink: { color: colors.textMuted, fontWeight: "700" }
});
