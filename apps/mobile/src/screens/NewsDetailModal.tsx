import React from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NewsItem } from "../api/types";
import { colors } from "../theme/colors";
import { InlineVideo } from "../components/InlineVideo";

export function NewsDetailModal({
  item,
  onClose,
  onEdit,
  onDelete
}: {
  item: NewsItem;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {item.mediaUrl ? (
            item.mediaType === "video" ? (
              <InlineVideo key={item.id} uri={item.mediaUrl} style={styles.image} controls />
            ) : (
              <Image source={{ uri: item.mediaUrl }} style={styles.image} />
            )
          ) : null}
          <Text style={styles.date}>{formatDate(item.publishedAt)}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body || "Nema dodatnog teksta za ovu vest."}</Text>

          {onEdit || onDelete ? (
            <View style={styles.adminRow}>
              {onEdit ? (
                <TouchableOpacity style={styles.adminButton} onPress={onEdit}>
                  <Text style={styles.adminButtonText}>Izmeni</Text>
                </TouchableOpacity>
              ) : null}
              {onDelete ? (
                <TouchableOpacity style={[styles.adminButton, styles.adminButtonDanger]} onPress={onDelete}>
                  <Text style={styles.adminButtonText}>Obrisi</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Zatvori</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sr-RS", { day: "numeric", month: "long", year: "numeric" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 100 },
  image: { width: "100%", height: 220, borderRadius: 18, marginBottom: 6 },
  date: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  body: { color: colors.textOnDarkMuted, fontSize: 16, lineHeight: 24 },
  closeButton: {
    position: "absolute",
    top: 54,
    right: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  closeButtonText: { color: "#fff", fontWeight: "800" },
  adminRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  adminButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)" },
  adminButtonDanger: { backgroundColor: "rgba(160,24,61,0.35)" },
  adminButtonText: { color: "#fff", fontWeight: "700" }
});
