import React, { useEffect, useState } from "react";
import {
  createGoalPoll,
  createNews,
  createStory,
  createStoryFolder,
  deleteNews,
  deleteStory,
  deleteStoryFolder,
  fetchCurrentGoalPoll,
  fetchNews,
  fetchSponsor,
  fetchStories,
  fetchStoryFolders,
  finishGoalPoll,
  setGoalPollStatus,
  updateNews,
  updateSponsor
} from "../api/endpoints";
import type { GoalPollOptionInput } from "../api/endpoints";
import { uploadMediaFile } from "../api/upload";
import { ApiError } from "../api/client";
import type { GoalPoll, NewsFeed, Sponsor, StoryFolder } from "../api/types";
import { ErrorNote, Spinner, StatusPill } from "../components/shared";

type Tab = "news" | "stories" | "goalpoll" | "sponsor";

export function ContentAdmin({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("news");

  return (
    <section className="teams-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Sadrzaj</p>
          <h2>Vesti, stories, gol nedelje i sponzor</h2>
          <p>Sve sto se ovde objavi odmah je vidljivo u mobilnoj aplikaciji.</p>
        </div>
        <div className="teams-actions">
          {(["news", "stories", "goalpoll", "sponsor"] as Tab[]).map((value) => (
            <button key={value} className={tab === value ? "primary" : ""} onClick={() => setTab(value)}>
              {tabLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {tab === "news" ? <NewsPanel /> : null}
      {tab === "stories" ? <StoriesPanel /> : null}
      {tab === "goalpoll" ? <GoalPollPanel /> : null}
      {tab === "sponsor" ? <SponsorPanel /> : null}
    </section>
  );
}

function tabLabel(tab: Tab): string {
  if (tab === "news") return "Vesti";
  if (tab === "stories") return "Stories";
  if (tab === "goalpoll") return "Gol nedelje";
  return "Sponzor";
}

function NewsPanel() {
  const [news, setNews] = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    fetchNews()
      .then(setNews)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam vesti."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleMediaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setMediaFile(file);
    setMediaPreview(file ? URL.createObjectURL(file) : "");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      let mediaUrl = "";
      let mediaType: string | undefined;
      if (mediaFile) {
        setUploading(true);
        const uploaded = await uploadMediaFile(mediaFile, "news");
        mediaUrl = uploaded.url;
        mediaType = uploaded.mediaType;
        setUploading(false);
      }
      await createNews({ title, body, mediaUrl, mediaType, isPublished: true });
      setTitle("");
      setBody("");
      setMediaFile(null);
      setMediaPreview("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Vest nije sacuvana.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  async function togglePublish(id: string, isPublished: boolean) {
    await updateNews(id, { isPublished: !isPublished });
    load();
  }

  async function remove(id: string) {
    await deleteNews(id);
    load();
  }

  return (
    <div className="teams-admin">
      <div className="teams-actions" style={{ marginBottom: 12 }}>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>Nova vest</button>
      </div>

      {showForm ? (
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="form-row">
            <label className="field">
              <span>Naslov</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Slika ili video</span>
              <input type="file" accept="image/*,video/*" onChange={handleMediaChange} />
            </label>
          </div>
          {mediaPreview ? (
            <div className="media-preview">
              {mediaFile?.type.startsWith("video/") ? (
                <video src={mediaPreview} controls style={{ maxWidth: 220, borderRadius: 12 }} />
              ) : (
                <img src={mediaPreview} alt="Pregled" style={{ maxWidth: 220, borderRadius: 12 }} />
              )}
            </div>
          ) : null}
          <label className="field">
            <span>Tekst</span>
            <input value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          {formError ? <ErrorNote message={formError} /> : null}
          <div className="form-actions">
            <button type="button" onClick={() => setShowForm(false)}>Otkazi</button>
            <button className="primary" type="submit" disabled={submitting}>
              {uploading ? "Otpremanje fajla..." : submitting ? "Cuvanje..." : "Objavi vest"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <Spinner /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {news ? (
        <div className="import-table">
          <div className="import-table-head">
            <span>Naslov</span>
            <span>Objavljeno</span>
            <span>Status</span>
            <span>Akcije</span>
          </div>
          {news.all.length === 0 ? <p className="empty-state">Jos nema vesti.</p> : null}
          {news.all.map((item) => (
            <div className="import-table-row" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("sr-RS") : "-"}</span>
              <StatusPill tone={item.isPublished ? "aktivan" : "sakriven"}>{item.isPublished ? "objavljeno" : "sakriveno"}</StatusPill>
              <div className="teams-actions">
                <button onClick={() => togglePublish(item.id, item.isPublished)}>
                  {item.isPublished ? "Sakrij" : "Objavi"}
                </button>
                <button onClick={() => remove(item.id)}>Obrisi</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StoriesPanel() {
  const [folders, setFolders] = useState<StoryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const [folderLogo, setFolderLogo] = useState("");
  const [storyFiles, setStoryFiles] = useState<Record<string, File | null>>({});
  const [storyTitles, setStoryTitles] = useState<Record<string, string>>({});
  const [uploadingFolderId, setUploadingFolderId] = useState("");
  const [storyError, setStoryError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    Promise.all([fetchStoryFolders(), fetchStories()])
      .then(([allFolders, activeFolders]) => {
        const activeMap = new Map(activeFolders.map((folder) => [folder.id, folder.stories ?? []]));
        setFolders(allFolders.map((folder) => ({ ...folder, stories: activeMap.get(folder.id) ?? [] })));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam stories."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createStoryFolder({ title: folderTitle, logoUrl: folderLogo });
      setFolderTitle("");
      setFolderLogo("");
      setShowFolderForm(false);
      load();
    } catch {
      // surfaced via reload failing silently is acceptable here; form stays open
    }
  }

  async function handleCreateStory(folderId: string) {
    const file = storyFiles[folderId];
    if (!file) return;
    setStoryError("");
    setUploadingFolderId(folderId);
    try {
      const uploaded = await uploadMediaFile(file, "story");
      await createStory({ folderId, mediaUrl: uploaded.url, mediaType: uploaded.mediaType, title: storyTitles[folderId] || "" });
      setStoryFiles((previous) => ({ ...previous, [folderId]: null }));
      setStoryTitles((previous) => ({ ...previous, [folderId]: "" }));
      load();
    } catch (err) {
      setStoryError(err instanceof Error ? err.message : "Story nije sacuvan.");
    } finally {
      setUploadingFolderId("");
    }
  }

  async function removeFolder(id: string) {
    await deleteStoryFolder(id);
    load();
  }

  async function removeStory(id: string) {
    await deleteStory(id);
    load();
  }

  return (
    <div className="teams-admin">
      <div className="teams-actions" style={{ marginBottom: 12 }}>
        <button className="primary" onClick={() => setShowFolderForm((v) => !v)}>Nova story rubrika</button>
      </div>

      {showFolderForm ? (
        <form className="inline-form" onSubmit={handleCreateFolder}>
          <div className="form-row">
            <label className="field">
              <span>Naziv rubrike</span>
              <input value={folderTitle} onChange={(e) => setFolderTitle(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              <span>Logo (URL)</span>
              <input value={folderLogo} onChange={(e) => setFolderLogo(e.target.value)} placeholder="https://..." />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setShowFolderForm(false)}>Otkazi</button>
            <button className="primary" type="submit">Sacuvaj rubriku</button>
          </div>
        </form>
      ) : null}

      {loading ? <Spinner /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {folders.length === 0 && !loading ? <p className="empty-state">Jos nema story rubrika. Napravi jednu iznad.</p> : null}
      {storyError ? <ErrorNote message={storyError} /> : null}

      {folders.map((folder) => (
        <div className="panel" key={folder.id} style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>{folder.title}</h2>
            <button onClick={() => removeFolder(folder.id)}>Obrisi rubriku</button>
          </div>

          <div className="chips">
            {(folder.stories ?? []).map((story) => (
              <div className="player-chip" key={story.id}>
                <span>{story.title || (story.mediaType === "video" ? "Video story" : "Story")}</span>
                <button className="ghost" onClick={() => removeStory(story.id)}>x</button>
              </div>
            ))}
            {(folder.stories ?? []).length === 0 ? <p className="empty-state">Nema aktivnih story-ja.</p> : null}
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Nova story slika/video</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setStoryFiles((previous) => ({ ...previous, [folder.id]: e.target.files?.[0] ?? null }))}
              />
            </label>
            <label className="field">
              <span>Naslov (opciono)</span>
              <input
                value={storyTitles[folder.id] ?? ""}
                onChange={(e) => setStoryTitles((previous) => ({ ...previous, [folder.id]: e.target.value }))}
              />
            </label>
            <button className="primary" onClick={() => handleCreateStory(folder.id)} disabled={uploadingFolderId === folder.id || !storyFiles[folder.id]}>
              {uploadingFolderId === folder.id ? "Otpremanje..." : "Dodaj story"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalPollPanel() {
  const [poll, setPoll] = useState<GoalPoll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("Glasaj za gol kola");
  const [options, setOptions] = useState<GoalPollOptionInput[]>([
    { title: "", videoUrl: "" },
    { title: "", videoUrl: "" }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    fetchCurrentGoalPoll()
      .then(setPoll)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam anketu."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function updateOption(index: number, field: "title" | "videoUrl", value: string) {
    setOptions((previous) => previous.map((option, i) => (i === index ? { ...option, [field]: value } : option)));
  }

  async function handleOptionVideo(index: number, file: File | null) {
    if (!file) return;
    setUploadingIndex(index);
    setFormError("");
    try {
      const uploaded = await uploadMediaFile(file, "goal");
      updateOption(index, "videoUrl", uploaded.url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Video nije otpremljen.");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await createGoalPoll({ title, status: "open", options });
      setShowForm(false);
      setOptions([{ title: "", videoUrl: "" }, { title: "", videoUrl: "" }]);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Anketa nije sacuvana.");
    } finally {
      setSubmitting(false);
    }
  }

  async function closePoll() {
    if (!poll) return;
    await setGoalPollStatus(poll.id, "closed");
    load();
  }

  async function reopenPoll() {
    if (!poll) return;
    await setGoalPollStatus(poll.id, "open");
    load();
  }

  async function finish() {
    if (!poll) return;
    await finishGoalPoll(poll.id);
    load();
  }

  return (
    <div className="teams-admin">
      <div className="teams-actions" style={{ marginBottom: 12 }}>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>Nova anketa</button>
      </div>

      {showForm ? (
        <form className="inline-form" onSubmit={handleCreate}>
          <label className="field">
            <span>Naslov ankete</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          {options.map((option, index) => (
            <div className="form-row" key={index}>
              <label className="field">
                <span>Opcija {index + 1} - naziv</span>
                <input value={option.title} onChange={(e) => updateOption(index, "title", e.target.value)} required />
              </label>
              <label className="field">
                <span>Video golova</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleOptionVideo(index, e.target.files?.[0] ?? null)}
                />
                {uploadingIndex === index ? <span className="muted">Otpremanje...</span> : null}
                {option.videoUrl && uploadingIndex !== index ? <span className="muted">Video spreman.</span> : null}
              </label>
            </div>
          ))}
          <div className="form-actions">
            <button type="button" onClick={() => setOptions((previous) => [...previous, { title: "", videoUrl: "" }])}>
              Dodaj opciju
            </button>
            {formError ? <ErrorNote message={formError} /> : null}
            <button type="button" onClick={() => setShowForm(false)}>Otkazi</button>
            <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Pokreni anketu"}</button>
          </div>
        </form>
      ) : null}

      {loading ? <Spinner /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {!loading && !poll ? <p className="empty-state">Trenutno nema aktivne ankete.</p> : null}

      {poll ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{poll.title}</h2>
            <StatusPill tone={poll.status === "open" ? "aktivan" : poll.status === "tiebreak" ? "provera" : "sakriven"}>{poll.status}</StatusPill>
          </div>
          {poll.options.map((option) => (
            <div className="player-table-row players-row-compact" key={option.id}>
              <strong>{option.title}</strong>
              <span>{option.votes} glasova</span>
              <b>{option.percent}%</b>
              <span>{option.isWinner ? "pobednik" : ""}</span>
            </div>
          ))}
          <div className="teams-actions" style={{ marginTop: 12 }}>
            {poll.status === "open" ? <button onClick={closePoll}>Zatvori glasanje</button> : null}
            {poll.status !== "open" && poll.status !== "closed" ? <button onClick={reopenPoll}>Ponovo otvori</button> : null}
            {poll.status !== "closed" ? <button className="primary" onClick={finish}>Zavrsi i proglasi pobednika</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SponsorPanel() {
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSponsor()
      .then((data) => {
        setSponsor(data);
        if (data) {
          setTitle(data.title);
          setSubtitle(data.subtitle);
          setLogoUrl(data.logoUrl);
          setTargetUrl(data.targetUrl);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam sponzora."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateSponsor({ id: sponsor?.id, title, subtitle, logoUrl, targetUrl, isActive: true });
      setSponsor(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sponzor nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <form className="inline-form" onSubmit={handleSave} style={{ maxWidth: 520 }}>
      <label className="field">
        <span>Naziv sponzora</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="field">
        <span>Podnaslov</span>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Logo (URL)</span>
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
      </label>
      <label className="field">
        <span>Link ka sponzoru</span>
        <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://..." />
      </label>
      {error ? <ErrorNote message={error} /> : null}
      {saved ? <p className="empty-state">Sacuvano.</p> : null}
      <div className="form-actions">
        <button className="primary" type="submit" disabled={saving}>{saving ? "Cuvanje..." : "Sacuvaj sponzora"}</button>
      </div>
    </form>
  );
}
