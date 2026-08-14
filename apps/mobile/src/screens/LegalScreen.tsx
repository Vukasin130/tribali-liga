import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";

type LegalKind = "privacy" | "terms";

export function LegalScreen({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const content = kind === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const title = kind === "privacy" ? "Politika privatnosti" : "Uslovi koriscenja";
  const isWide = useIsWideScreen();

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Zatvori</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.eyebrow}>Tribali Liga</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.updated}>Poslednje azurirano: jul 2026.</Text>

          {content.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const PRIVACY_SECTIONS = [
  {
    heading: "Koje podatke prikupljamo",
    body:
      "Kada napravis nalog cuvamo tvoj email, ime koje unesos i lozinku (u bezbedno hesovanom obliku - nikad je ne vidimo u citljivom tekstu). Ako izabere fantasy tim, cuvamo koje igrace si izabrao i tvoje poene po kolu. Ako zatrazis verifikaciju kao pravi igrac lige, cuvamo koju ekipu i ime igraca si naveo. Ne prikupljamo lokaciju, kontakte niti bilo sta iz tvog telefona van onoga sto sam unesos u aplikaciju."
  },
  {
    heading: "Kako koristimo podatke",
    body:
      "Podaci se koriste iskljucivo da bi aplikacija radila: prijava, cuvanje fantasy tima, prikaz rang liste, obrada zahteva za verifikaciju i prikaz sadrzaja lige. Ne prodajemo tvoje podatke trecim stranama i ne koristimo ih za oglasavanje van same aplikacije."
  },
  {
    heading: "Gde se podaci cuvaju",
    body:
      "Podaci se cuvaju kod Supabase (Postgres baza sa autentifikacijom), infrastrukturnog provajdera koji koristimo za backend. Komunikacija izmedju aplikacije i servera ide preko standardnih bezbednih HTTPS konekcija."
  },
  {
    heading: "Tvoja prava",
    body:
      "Mozes u svakom trenutku izmeniti ime i profilnu sliku u podesavanjima naloga. Ako zelis da ti nalog i svi podaci budu trajno obrisani, kontaktiraj nas na email naveden u podesavanjima aplikacije - zahtev obradjujemo u razumnom roku."
  },
  {
    heading: "Deca",
    body:
      "Aplikacija nije namenjena deci mladjoj od 13 godina. Ako saznamo da je nalog napravilo dete mladje od 13 godina, nalog cemo ukloniti."
  },
  {
    heading: "Kontakt",
    body:
      "Za sva pitanja o privatnosti, pisi nam na email koji je naveden na stranici podrske u okviru aplikacije ili prodavnice aplikacija."
  }
];

const TERMS_SECTIONS = [
  {
    heading: "Sta je Tribali Liga",
    body:
      "Tribali Liga je fantasy-sport aplikacija za amaterske gradske fudbalske lige. Korisnici prave fantasy tim od pravih igraca i prate rezultate, vesti i ankete lige. Aplikacija ne organizuje novcane naklade niti kockanje - fantasy poeni su iskljucivo za zabavu i rangiranje unutar aplikacije."
  },
  {
    heading: "Tvoj nalog",
    body:
      "Odgovoran si za tacnost podataka koje unosis i za cuvanje svoje lozinke. Nalog je licni i ne sme se deliti. Admin nalog se ne registruje kroz aplikaciju."
  },
  {
    heading: "Verifikacija igraca",
    body:
      "Ako zatrazis da budes oznacen kao pravi igrac lige, administrator rucno pregleda i odobrava ili odbija zahtev. Lazno predstavljanje kao drugi igrac je zabranjeno i moze dovesti do trajnog uklanjanja naloga."
  },
  {
    heading: "Ponasanje u aplikaciji",
    body:
      "Ocekujemo fer ponasanje: bez uvredljivog sadrzaja, spama ili pokusaja zloupotrebe fantasy sistema (npr. vise naloga iste osobe radi manipulacije rang listom)."
  },
  {
    heading: "Izmene aplikacije",
    body:
      "Fantasy pravila (budzet, broj igraca, poeni po akciji) mogu se menjati izmedju sezona radi poboljsanja iskustva. O znacajnim izmenama obavestavamo kroz vesti u aplikaciji."
  },
  {
    heading: "Ogranicenje odgovornosti",
    body:
      "Aplikacija se pruza takva kakva jeste. Trudimo se da podaci o utakmicama i poeni budu tacni, ali ne garantujemo odsustvo gresaka u unosu uzivo tokom utakmica."
  }
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  closeButton: {
    position: "absolute",
    top: 54,
    right: 18,
    zIndex: 2,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  closeButtonText: { color: "#fff", fontWeight: "800" },
  content: { padding: 20, paddingTop: 60, gap: 6, paddingBottom: 60 },
  eyebrow: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  updated: { color: colors.textOnDarkMuted, fontSize: 12, marginBottom: 12 },
  section: { marginTop: 14, gap: 6 },
  heading: { color: "#fff", fontWeight: "800", fontSize: 16 },
  body: { color: colors.textOnDarkMuted, fontSize: 14, lineHeight: 21 }
});
