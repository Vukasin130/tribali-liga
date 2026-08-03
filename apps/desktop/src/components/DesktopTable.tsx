import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, EmptyState } from "@tribali-liga/mobile/shared";

export type DesktopTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  width?: number;
  align?: "left" | "center" | "right";
};

export function DesktopTable<T>({
  columns,
  data,
  keyExtractor,
  onRowPress,
  emptyMessage
}: {
  columns: DesktopTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (data.length === 0) return <EmptyState message={emptyMessage ?? "Nema podataka."} />;

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.headerCell, colStyle(column)]}>
            {column.label}
          </Text>
        ))}
      </View>
      {data.map((row) => (
        <DesktopTableRow key={keyExtractor(row)} row={row} columns={columns} onPress={onRowPress} />
      ))}
    </View>
  );
}

function DesktopTableRow<T>({
  row,
  columns,
  onPress
}: {
  row: T;
  columns: DesktopTableColumn<T>[];
  onPress?: (row: T) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress ? () => onPress(row) : undefined}
      style={[styles.bodyRow, hovered && onPress ? styles.bodyRowHovered : null]}
    >
      {columns.map((column) => (
        <View key={column.key} style={colStyle(column)}>
          {column.render(row)}
        </View>
      ))}
    </Pressable>
  );
}

function colStyle<T>(column: DesktopTableColumn<T>) {
  return {
    flex: column.width ? undefined : 1,
    width: column.width,
    alignItems: column.align === "right" ? "flex-end" : column.align === "center" ? "center" : "flex-start"
  } as const;
}

const styles = StyleSheet.create({
  table: { borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card, overflow: "hidden" },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  headerCell: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  bodyRowHovered: { backgroundColor: colors.surfaceMuted }
});
