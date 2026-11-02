import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Expand,
  Flag,
  FolderOpen,
  GraduationCap,
  HardDrive,
  LineChart,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type {
  BankPage,
  Bootstrap,
  Fact,
  Progress,
  Queue,
  Quiz,
  QuizSummary,
  RatingName,
  Settings,
  Team,
} from "../shared/types";
import { guide } from "./guide";

type Page =
  | "Study"
  | "Question Bank"
  | "Quizzes"
  | "Progress"
  | "Guide"
  | "Settings";
const nav = [
  { name: "Study", icon: GraduationCap },
  { name: "Question Bank", icon: BookOpen },
  { name: "Quizzes", icon: Users },
  { name: "Progress", icon: LineChart },
  { name: "Guide", icon: CircleHelp },
] as const;
const ratingButtons: {
  rating: RatingName;
  key: string;
  title: string;
  hint: string;
}[] = [
  { rating: "again", key: "1", title: "Again", hint: "Forgotten" },
  { rating: "hard", key: "2", title: "Hard", hint: "Correct, with effort" },
  { rating: "good", key: "3", title: "Good", hint: "Correct" },
  { rating: "easy", key: "4", title: "Easy", hint: "Immediate recall" },
];
const api = () => window.trainer;
const reportError = (error: unknown) =>
  window.dispatchEvent(
    new CustomEvent("trainer-error", {
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [page, setPage] = useState<Page>("Study"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<Queue | null>(null),
    [studying, setStudying] = useState(false),
    [shown, setShown] = useState(false);
  const [practice, setPractice] = useState<Fact[]>([]),
    [practiceIndex, setPracticeIndex] = useState(0);
  const [image, setImage] = useState<Fact | null>(null),
    [progress, setProgress] = useState<Progress | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [history, setHistory] = useState<QuizSummary[]>([]),
    [quizAnswer, setQuizAnswer] = useState(false);
  const busyRef = useRef(false);
  const ready = boot !== null;
  const hasQueueCard = !!queue?.card;
  const nextLearning = queue?.nextLearning;
  const run = useCallback(
    async <T,>(work: () => Promise<T>, accept?: (result: T) => void) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await work();
        accept?.(result);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message.replace(
                /^Error invoking remote method '[^']+': (Error: )?/,
                "",
              )
            : String(e),
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );
  const load = useCallback(async () => {
    const b = await api().bootstrap();
    setBoot(b);
    setQueue(await api().queue());
  }, []);
  useEffect(() => {
    if (!window.trainer) {
      setError(
        "Open PetroBowl Trainer from its desktop shortcut. This screen needs the local desktop service.",
      );
      return;
    }
    void run(load);
  }, [load, run]);
  useEffect(() => {
    const handler = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener("trainer-error", handler);
    return () => window.removeEventListener("trainer-error", handler);
  }, []);
  useEffect(() => {
    if (page === "Study" && ready && !busyRef.current)
      void api().queue().then(setQueue).catch(reportError);
  }, [page, ready]);
  useEffect(() => {
    if (!image) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImage(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [image]);
  useEffect(() => {
    if (!ready) return;
    if (page === "Progress") void run(() => api().progress(), setProgress);
    if (page === "Quizzes") void run(() => api().quizzes(), setHistory);
  }, [page, ready, run]); // refresh on navigation
  useEffect(() => {
    setShown(false);
  }, [queue?.card?.id, queue?.card?.revision, practiceIndex, practice.length]);
  useEffect(()=>{if(page==='Study'&&studying)window.scrollTo({top:0,behavior:'instant'});},[page,studying,queue?.card?.id,practiceIndex]);
  useEffect(() => {
    if (!nextLearning || hasQueueCard || page !== "Study") return;
    const timer = setInterval(() => {
      if (!busyRef.current)
        void api()
          .queue()
          .then(setQueue)
          .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [nextLearning, hasQueueCard, page]);
  useEffect(() => {
    setQuizAnswer(false);
  }, [quiz?.index, quiz?.id]);
  const grade = useCallback(
    (rating: RatingName) => {
      const c = queue?.card;
      if (!c || !shown || practice.length) return;
      void run(
        () =>
          api().review({
            factId: c.id,
            rating,
            revision: c.revision,
            operationId: crypto.randomUUID(),
            scheduledAt: c.scheduledAt,
          }),
        setQueue,
      );
    },
    [queue, shown, practice.length, run],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        page !== "Study" ||
        !studying ||
        image ||
        !boot?.settings.onboarded ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setShown(true);
      }
      const r = ratingButtons.find((r) => r.key === e.key);
      if (r && shown && !practice.length) {
        e.preventDefault();
        grade(r.rating);
      }
      if (e.key === "Escape") {
        setStudying(false);
        setPractice([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    page,
    studying,
    shown,
    grade,
    practice.length,
    image,
    boot?.settings.onboarded,
  ]);
  const saveSettings = (patch: Partial<Settings>, onSaved?: () => void) =>
    run(
      () => api().settings(patch),
      (s) => {
        setBoot((b) => (b ? { ...b, settings: s } : b));
        void api()
          .queue()
          .then(setQueue)
          .catch((e) => setError(String(e)));
        onSaved?.();
      },
    );
  const startPractice = (facts: Fact[]) => {
    setPractice(facts);
    setPracticeIndex(0);
    setStudying(true);
    setShown(false);
    setPage("Study");
  };
  const current = practice.length ? practice[practiceIndex] : queue?.card;
  const quizAction = (
    action: "correct" | "wrong" | "unanswered" | "next" | "undo",
    player?: string,
  ) => {
    if (quiz)
      void run(
        () =>
          api().quizAction({
            id: quiz.id,
            revision: quiz.revision,
            action,
            player,
          }),
        (q) => {
          setQuiz(q);
          setBoot((b) =>
            b ? { ...b, activeQuiz: q.completedAt ? null : q.id } : b,
          );
          void api().quizzes().then(setHistory);
        },
      );
  };

  return (
    <div className="app">
      <aside
        className="sidebar"
        inert={!!image || (!!boot && !boot.settings.onboarded)}
      >
        <div className="brand">
          <span className="brand-mark">
            PB
            <span />
          </span>
          <div>
            PetroBowl<span className="brand-sub">TRAINER</span>
          </div>
        </div>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {nav.map((n) => (
            <button
              key={n.name}
              className={`nav-item ${page === n.name ? "active" : ""}`}
              onClick={() => {
                setPage(n.name);
                setError("");
              }}
            >
              <n.icon size={19} />
              {n.name}
              {n.name === "Study" && !!queue?.due && (
                <span className="nav-count">{queue.due}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => setPage("Settings")}
          >
            <Settings2 size={18} />
            Settings & backups
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <div>
              Stored on this device<span>Private. Available offline.</span>
            </div>
            <HardDrive size={15} />
          </div>
        </div>
      </aside>
      <main className={page==='Study'&&studying?'study-focus':''} inert={!!image || (!!boot && !boot.settings.onboarded)}>
        <header className="topbar">
          <span>{page}</span>
          <div>
            <span className="small-dot" />
            LOCAL WORKSPACE <span className="top-divider" />{" "}
            <span className="profile">P</span>
          </div>
        </header>
        <div className="workspace">
          {error && (
            <div role="alert" className="error">
              <Flag size={17} />
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    await load();
                    if (quiz) setQuiz(await api().quiz(quiz.id));
                  })
                }
              >
                Refresh
              </button>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!boot ? (
            <div className="empty">
              <GraduationCap />
              <h1>Opening your workspace</h1>
              <p>Your learning history stays on this computer.</p>
            </div>
          ) : (
            <>
              {page === "Study" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">BUILD LASTING RECALL</div>
                      <h1>
                        {practice.length ? "Extra practice" : "Daily study"}
                      </h1>
                      <p>
                        {practice.length
                          ? "Practice together. Your scheduled reviews stay as they are."
                          : "Recall first. Understand the answer. Come back at the right time."}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("Guide")}
                    >
                      <CircleHelp size={16} />
                      How to study
                    </button>
                  </div>
                  <div className="study-layout">
                    <div>
                      <div className="study-stats">
                        <div>
                          <strong>{queue?.due ?? 0}</strong>
                          <span>Reviews due</span>
                        </div>
                        <div>
                          <strong>{queue?.learning ?? 0}</strong>
                          <span>Learning now</span>
                        </div>
                        <div>
                          <strong>{queue?.newAvailable ?? 0}</strong>
                          <span>New today</span>
                        </div>
                        <div>
                          <strong>{queue?.reviewedToday ?? 0}</strong>
                          <span>Reviews completed</span>
                        </div>
                      </div>
                      {!studying ? (
                        <section className="study-start">
                          <div className="study-symbol">
                            <GraduationCap size={46} strokeWidth={1.2} />
                          </div>
                          <div className="eyebrow">YOUR NEXT SESSION</div>
                          <h2>
                            {queue?.card
                              ? "Ready when you are."
                              : queue?.nextLearning
                                ? "Let the interval do its work."
                                : "You’re up to date."}
                          </h2>
                          <p>
                            {queue?.card
                              ? "Start with what is due, then meet a few new ideas."
                              : queue?.nextLearning
                                ? `Your next learning step is due ${new Date(queue.nextLearning).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}. You can close the app and return.`
                                : "Choose more topics, change your new-fact limit, or come back for your next review."}
                          </p>
                          <button
                            className="primary"
                            disabled={!queue?.card || busy}
                            onClick={() =>
                              void run(
                                () => api().queue(),
                                (q) => {
                                  setQueue(q);
                                  setPractice([]);
                                  setStudying(true);
                                  setShown(false);
                                },
                              )
                            }
                          >
                            Start studying
                            <ArrowRight size={17} />
                          </button>
                          <span className="quiet">
                            {queue?.total.toLocaleString()} facts in your
                            selected topics
                          </span>
                        </section>
                      ) : (
                        <section className="flashcard" aria-label="Study card">
                          <div className="card-toolbar">
                            <span className="state-label">
                              {practice.length
                                ? `EXTRA PRACTICE · ${practiceIndex + 1} / ${practice.length}`
                                : (queue?.card?.state?.toUpperCase() ??
                                  "SESSION COMPLETE")}
                            </span>
                            <button
                              className="text-button"
                              onClick={() => {
                                setStudying(false);
                                setPractice([]);
                              }}
                            >
                              Finish session
                              <X size={15} />
                            </button>
                          </div>
                          {current ? (
                            <>
                              <div className="topic-line">
                                {current.topics.join(" · ")}
                              </div>
                              <h2 className="question">{current.learn}</h2>
                              {shown ? (
                                <>
                                  <Answer fact={current} enlarge={setImage} />
                                  {practice.length ? (
                                    <button
                                      className="primary full"
                                      onClick={() => {
                                        if (practiceIndex < practice.length - 1)
                                          setPracticeIndex((i) => i + 1);
                                        else {
                                          setPractice([]);
                                          setStudying(false);
                                        }
                                      }}
                                    >
                                      {practiceIndex < practice.length - 1
                                        ? "Next practice question"
                                        : "Finish practice"}
                                      <ArrowRight size={17} />
                                    </button>
                                  ) : (
                                    <div className="rating-row">
                                      {ratingButtons.map((r) => (
                                        <button
                                          disabled={busy}
                                          key={r.rating}
                                          className={`rating ${r.rating}`}
                                          onClick={() => grade(r.rating)}
                                        >
                                          <span className="interval">
                                            {
                                              queue?.card?.previews[r.rating]
                                                .label
                                            }
                                          </span>
                                          <strong>{r.title}</strong>
                                          <span>{r.hint}</span>
                                          <kbd>{r.key}</kbd>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="reveal-area">
                                  <p className="quiet">
                                    Take a moment to recall the answer.
                                  </p>
                                  <button
                                    aria-label="Show answer"
                                    className="primary full"
                                    onClick={() => setShown(true)}
                                  >
                                    Show answer
                                    <span className="shortcut">SPACE</span>
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="empty">
                              <Check size={32} />
                              <h2>That’s your current queue.</h2>
                              <p>
                                {queue?.nextLearning
                                  ? `Next learning step: ${new Date(queue.nextLearning).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}. Your place is saved.`
                                  : "Your reviews are saved. Come back when more are due."}
                              </p>
                              <button
                                className="secondary"
                                onClick={() => setStudying(false)}
                              >
                                Back to study
                              </button>
                            </div>
                          )}
                        </section>
                      )}
                      <div className="below-card">
                        <span>
                          <ShieldCheck size={15} />
                          Every review is saved automatically
                        </span>
                        <button
                          className="text-button"
                          disabled={
                            !queue?.canUndo || busy || !!practice.length
                          }
                          onClick={() => void run(() => api().undo(), setQueue)}
                        >
                          <RotateCcw size={15} />
                          Undo last review
                        </button>
                      </div>
                    </div>
                    <aside className="study-context">
                      <div className="context-title">STUDY PLAN</div>
                      <div className="context-block">
                        <h3>{boot.settings.newPerDay} new facts / day</h3>
                        <p>
                          Finish due reviews before introducing new material.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setPage("Settings")}
                        >
                          Adjust daily limit
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className="context-block">
                        <h3>Topics</h3>
                        <p>
                          {boot.settings.selectedTopics.length
                            ? `${boot.settings.selectedTopics.length} selected`
                            : "All topics included"}
                        </p>
                        <TopicPicker
                          topics={boot.topics}
                          selected={boot.settings.selectedTopics}
                          change={(selectedTopics) =>
                            void saveSettings({ selectedTopics })
                          }
                          disabled={busy}
                        />
                      </div>
                      <div className="context-block">
                        <div className="coverage-label">
                          <h3>Studied coverage</h3>
                          <span>
                            {queue?.studied.toLocaleString()} /{" "}
                            {queue?.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="meter">
                          <span
                            style={{
                              width: `${queue?.total ? (queue.studied / queue.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <p>
                          Distinct facts reviewed at least once. Shared topic
                          tags count once.
                        </p>
                      </div>
                      <div className="study-tip">
                        <Clock3 size={20} />
                        <h3>A little space helps.</h3>
                        <p>
                          Try recalling before revealing. The image is there to
                          explain the answer afterward.
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {page === "Question Bank" && (
                <Bank
                  topics={boot.topics}
                  run={run}
                  enlarge={setImage}
                  practice={startPractice}
                  busy={busy}
                />
              )}
              {page === "Quizzes" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">PRACTICE TOGETHER</div>
                      <h1>Team quizzes</h1>
                      <p>
                        A shared question set. A clear record of this session.
                      </p>
                    </div>
                    {quiz && (
                      <button
                        className="secondary"
                        onClick={() => setQuiz(null)}
                      >
                        <ArrowLeft size={15} />
                        All quizzes
                      </button>
                    )}
                  </div>
                  {quiz ? (
                    <>
                      {!quiz.completedAt ? (
                        <div className="quiz-layout">
                          <section className="flashcard">
                            <div className="card-toolbar">
                              <span className="state-label">
                                {quiz.name} · {quiz.index + 1} /{" "}
                                {quiz.questions.length}
                              </span>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => quizAction("undo")}
                              >
                                <RotateCcw size={15} />
                                Undo
                              </button>
                            </div>
                            <div className="topic-line">
                              {quiz.questions[quiz.index].fact.topics.join(
                                " · ",
                              )}
                            </div>
                            <h2 className="question">
                              {quiz.questions[quiz.index].fact.quiz}
                            </h2>
                            <div className="quizmaster-note">
                              <ShieldCheck size={15} />
                              Quizmaster view. Read the question aloud.
                            </div>
                            <button
                              className="secondary"
                              onClick={() => setQuizAnswer((s) => !s)}
                            >
                              {quizAnswer ? "Hide answer" : "Show answer"}
                            </button>
                            {quizAnswer && (
                              <Answer
                                fact={quiz.questions[quiz.index].fact}
                                enlarge={setImage}
                              />
                            )}
                            <div className="attempts">
                              {quiz.questions[quiz.index].attempts.map(
                                (a, i) => (
                                  <span
                                    key={i}
                                    className={
                                      a.correct
                                        ? "attempt-correct"
                                        : "attempt-wrong"
                                    }
                                  >
                                    {a.player} ·{" "}
                                    {a.correct ? "Correct" : "Wrong"}
                                  </span>
                                ),
                              )}
                            </div>
                            {!quiz.questions[quiz.index].closed ? (
                              <>
                                <div className="member-scoring">
                                  {quiz.team.members.map((m) => {
                                    const attempted = quiz.questions[
                                      quiz.index
                                    ].attempts.some((a) => a.player === m);
                                    return (
                                      <div key={m}>
                                        <strong>{m}</strong>
                                        <button
                                          className="correct-button"
                                          disabled={busy || attempted}
                                          onClick={() =>
                                            quizAction("correct", m)
                                          }
                                        >
                                          <Check size={16} />
                                          Correct
                                        </button>
                                        <button
                                          className="secondary"
                                          disabled={busy || attempted}
                                          onClick={() => quizAction("wrong", m)}
                                        >
                                          <X size={16} />
                                          Wrong
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => quizAction("unanswered")}
                                >
                                  Mark unanswered
                                </button>
                              </>
                            ) : (
                              <button
                                className="primary full"
                                disabled={busy}
                                onClick={() => quizAction("next")}
                              >
                                {quiz.index === quiz.questions.length - 1
                                  ? "Finish quiz & view report"
                                  : "Next question"}
                                <ArrowRight size={16} />
                              </button>
                            )}
                          </section>
                          <aside className="study-context">
                            <h3>{quiz.team.name}</h3>
                            <Scoreboard quiz={quiz} />
                            <p className="quiet">
                              Correct answers determine rank. Equal counts are
                              tied. Wrong attempts are shown separately.
                            </p>
                            <p className="quiet">
                              This quiz resumes automatically when reopened.
                            </p>
                          </aside>
                        </div>
                      ) : (
                        <QuizReport
                          quiz={quiz}
                          enlarge={setImage}
                          practice={startPractice}
                          undo={() => quizAction("undo")}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {boot.activeQuiz && (
                        <button
                          className="resume-banner"
                          onClick={() =>
                            void run(
                              () => api().quiz(boot.activeQuiz!),
                              setQuiz,
                            )
                          }
                        >
                          <Play size={18} />
                          <span>Resume unfinished quiz</span>
                          <ArrowRight size={17} />
                        </button>
                      )}
                      <QuizSetup
                        boot={boot}
                        busy={busy}
                        run={run}
                        onTeam={(t) =>
                          setBoot((b) =>
                            b
                              ? {
                                  ...b,
                                  teams: [
                                    ...b.teams.filter((x) => x.id !== t.id),
                                    t,
                                  ],
                                }
                              : b,
                          )
                        }
                        onCreate={(q) => {
                          setQuiz(q);
                          setBoot((b) => (b ? { ...b, activeQuiz: q.id } : b));
                        }}
                      />
                      <section className="section">
                        <div className="section-heading">
                          <h2>Session history</h2>
                          <span className="quiet">
                            Player results stay within each report
                          </span>
                        </div>
                        {history.length ? (
                          <div className="history-list">
                            {history.map((q) => (
                              <button
                                key={q.id}
                                className="history-row"
                                onClick={() =>
                                  void run(() => api().quiz(q.id), setQuiz)
                                }
                              >
                                <span className="history-icon">
                                  <Users size={18} />
                                </span>
                                <div>
                                  <strong>{q.name}</strong>
                                  <span>
                                    {q.team} · {date(q.startedAt)} · {q.count}{" "}
                                    questions
                                  </span>
                                </div>
                                <span className="history-result">
                                  {q.completedAt
                                    ? `${q.correct} / ${q.count} correct`
                                    : "In progress"}
                                </span>
                                <ArrowRight size={17} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="empty small">
                            <Users size={28} />
                            <h3>Your first session starts here.</h3>
                            <p>Save a roster and create a quiz above.</p>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
              {page === "Progress" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR LEARNING</div>
                      <h1>Progress with a next step.</h1>
                      <p>
                        Recall and coverage help you decide what to review next.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        setStudying(false);
                        setPage("Study");
                      }}
                    >
                      Go to study
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {progress && (
                    <>
                      <div className="progress-top">
                        <section className="chart-section">
                          <div className="section-heading">
                            <h2>Recall accuracy</h2>
                            <span className="quiet">
                              Rolling 7 days · last 28 days
                            </span>
                          </div>
                          <RecallChart data={progress} />
                          <p className="quiet">
                            First scheduled review per fact per study day. New
                            learning and extra practice are excluded.
                          </p>
                        </section>
                        <aside className="coverage-overview">
                          <span className="eyebrow">STUDIED COVERAGE</span>
                          <strong>
                            {progress.total
                              ? Math.round(
                                  (progress.studied / progress.total) * 100,
                                )
                              : 0}
                            <small>%</small>
                          </strong>
                          <p>
                            {progress.studied.toLocaleString()} of{" "}
                            {progress.total.toLocaleString()} distinct facts
                            reviewed.
                          </p>
                          <span className="quiet">
                            Coverage records exposure. It does not prove
                            mastery.
                          </span>
                        </aside>
                      </div>
                      <section className="section">
                        <h2>What to review next</h2>
                        {progress.priorities.length ? (
                          <div className="priorities">
                            {progress.priorities.map((p) => (
                              <button
                                key={p.topic}
                                onClick={() =>
                                  void run(async () => {
                                    const s = await api().settings({
                                      selectedTopics: [p.topic],
                                    });
                                    setBoot((b) =>
                                      b ? { ...b, settings: s } : b,
                                    );
                                    setQueue(await api().queue());
                                    setPage("Study");
                                    setStudying(true);
                                  })
                                }
                              >
                                <span>
                                  <strong>{p.topic}</strong>
                                  <small>{p.reason}</small>
                                </span>
                                <ArrowRight size={18} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="quiet">
                            No overdue priorities. Follow your daily queue and
                            let your review history build.
                          </p>
                        )}
                      </section>
                      <section className="section">
                        <h2>Topic coverage</h2>
                        <div className="topic-table">
                          {progress.coverage.map((t) => (
                            <div key={t.topic}>
                              <span>{t.topic}</span>
                              <div className="meter">
                                <span
                                  style={{
                                    width: `${(t.studied / t.total) * 100}%`,
                                  }}
                                />
                              </div>
                              <span>
                                {t.studied} / {t.total}
                              </span>
                              <small>
                                {t.due ? `${t.due} due` : "Up to date"}
                              </small>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
              {page === "Guide" && <Guide />}
              {page === "Settings" && (
                <SettingsPage
                  boot={boot}
                  busy={busy}
                  save={saveSettings}
                  run={run}
                  restored={load}
                />
              )}
            </>
          )}
          <footer>
            PetroBowl Trainer <span>·</span>{" "}
            {boot?.manifest.version ?? "Local edition"} <span>·</span> Your
            learning stays here.
            {boot && !boot.manifest.releaseReady && (
              <>
                <span>·</span>
                <button onClick={() => setPage("Settings")}>
                  Content preview
                </button>
              </>
            )}
          </footer>
        </div>
      </main>
      {boot && !boot.settings.onboarded && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="welcome"
          >
            <div className="brand-mark">PB</div>
            <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
            <h1 id="welcome-title">Build recall, one session at a time.</h1>
            <p>
              This computer keeps one private learning history. Save a team
              roster when you want to practice together.
            </p>
            {!boot.manifest.releaseReady && (
              <p className="preview-note">
                This preview includes a collection still under question and
                image review.
              </p>
            )}
            <ol>
              <li>
                <strong>Finish due reviews.</strong>
                <span>Keep the ideas you already learned accessible.</span>
              </li>
              <li>
                <strong>Learn a few new facts.</strong>
                <span>Recall first, then reveal the answer and image.</span>
              </li>
              <li>
                <strong>Practice as a team.</strong>
                <span>Use quiz reports to choose what to revisit.</span>
              </li>
            </ol>
            <button
              className="primary full"
              disabled={busy}
              onClick={() => void saveSettings({ onboarded: true })}
            >
              Open my workspace
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {image && (
        <div className="modal-backdrop" onClick={() => setImage(null)}>
          <section
            className="image-modal"
            role="dialog"
            aria-modal="true"
            aria-label={image.answer}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              autoFocus
              aria-label="Close image"
              onClick={() => setImage(null)}
            >
              <X />
            </button>
            <h2>{image.answer}</h2>
            {image.image && (
              <img src={api().imageUrl(image.image)} alt={image.alt} />
            )}
            <p>{image.caption}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function Answer({ fact, enlarge }: { fact: Fact; enlarge: (f: Fact) => void }) {
  return (
    <div className="answer">
      <span className="eyebrow">ANSWER</span>
      <h3>{fact.answer}</h3>
      {fact.acceptedAnswers.filter(
        (a) => a.toLowerCase() !== fact.answer.toLowerCase(),
      ).length > 0 && (
        <p className="accepted">
          Also accepted:{" "}
          {fact.acceptedAnswers
            .filter((a) => a.toLowerCase() !== fact.answer.toLowerCase())
            .join(" · ")}
        </p>
      )}
      <p className="explanation">{fact.explanation}</p>
      {fact.image ? (
        <figure>
          <button
            className="figure-button"
            onClick={() => enlarge(fact)}
            aria-label={`Enlarge image: ${fact.answer}`}
          >
            <img src={api().imageUrl(fact.image)} alt={fact.alt} />
            <Expand size={16} />
          </button>
          <figcaption>{fact.caption}</figcaption>
        </figure>
      ) : (
        <div className="media-pending">
          <BookOpen size={18} />
          <span>
            An explanatory image is still being prepared for this fact.
          </span>
        </div>
      )}
      <details className="sources">
        <summary>
          Sources
          <ChevronDown size={13} />
        </summary>
        {fact.sources.map((s, i) => (
          <button
            key={i}
            onClick={() => void api().openSource(s.url).catch(reportError)}
          >
            {s.title}
            <ArrowRight size={12} />
          </button>
        ))}
      </details>
    </div>
  );
}
function TopicPicker({
  topics,
  selected,
  change,
  disabled = false,
}: {
  topics: Bootstrap["topics"];
  selected: string[];
  change: (s: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  return (
    <details className="topic-picker">
      <summary>
        Choose topics
        <ChevronDown size={15} />
      </summary>
      <div className="topic-options">
        <input
          aria-label="Find topics"
          placeholder="Find a topic…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => change([])}
        >
          Include all topics
        </button>
        {topics
          .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
          .map((t) => (
            <label key={t.name}>
              <input
                type="checkbox"
                checked={selected.includes(t.name)}
                disabled={disabled}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...selected, t.name]
                      : selected.filter((s) => s !== t.name),
                  )
                }
              />
              <span>{t.name}</span>
              <small>{t.count}</small>
            </label>
          ))}
      </div>
    </details>
  );
}
type Run = <T>(
  work: () => Promise<T>,
  accept?: (result: T) => void,
) => Promise<void>;
function Bank({
  topics,
  run,
  enlarge,
  practice,
  busy,
}: {
  topics: Bootstrap["topics"];
  run: Run;
  enlarge: (f: Fact) => void;
  practice: (f: Fact[]) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState(""),
    [topic, setTopic] = useState(""),
    [page, setPage] = useState(0),
    [suspendedOnly, setSuspendedOnly] = useState(false),
    [data, setData] = useState<BankPage | null>(null),
    [expanded, setExpanded] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    const seq = ++sequence.current;
    const timer = setTimeout(() => {
      void api()
        .bank({ query, topic, page, suspendedOnly })
        .then((r) => {
          if (seq === sequence.current) setData(r);
        })
        .catch(reportError);
    }, 160);
    return () => clearTimeout(timer);
  }, [query, topic, page, suspendedOnly]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE PACKAGED COLLECTION</div>
          <h1>Question bank</h1>
          <p>Explore explanations, check sources, and choose extra practice.</p>
        </div>
        <BookOpen className="heading-icon" size={34} />
      </div>
      <div className="bank-tools">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search question bank"
            placeholder="Search terms, questions, or topics…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Filter by topic"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
        <label className="check-label">
          <input
            type="checkbox"
            checked={suspendedOnly}
            onChange={(e) => {
              setSuspendedOnly(e.target.checked);
              setPage(0);
            }}
          />
          Suspended only
        </label>
      </div>
      <div className="list-header">
        <span>{data?.total.toLocaleString() ?? "…"} facts</span>
        <span>Learning prompt · click to explore</span>
      </div>
      <div className="bank-list">
        {data?.facts.map((f) => (
          <article
            className={`bank-item ${expanded === f.id ? "expanded" : ""}`}
            key={f.id}
          >
            <button
              className="bank-question"
              onClick={() => setExpanded((s) => (s === f.id ? "" : f.id))}
            >
              <span className="bank-state">
                {f.suspended ? (
                  <Pause size={15} />
                ) : f.studied ? (
                  <Check size={15} />
                ) : (
                  <span className="unseen-dot" />
                )}
              </span>
              <span>
                <small>{f.topics.join(" · ")}</small>
                <strong>{f.learn}</strong>
              </span>
              <ChevronDown size={17} />
            </button>
            {expanded === f.id && (
              <div className="bank-detail">
                <Answer fact={f} enlarge={enlarge} />
                <div className="inline-actions">
                  <button className="secondary" onClick={() => practice([f])}>
                    <Play size={15} />
                    Extra practice
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api().suspend({
                          factId: f.id,
                          suspended: !f.suspended,
                        });
                        setData(
                          await api().bank({
                            query,
                            topic,
                            page,
                            suspendedOnly,
                          }),
                        );
                      })
                    }
                  >
                    {f.suspended
                      ? "Resume scheduled study"
                      : "Suspend from study"}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {data?.total === 0 && (
        <div className="empty small">
          <Search />
          <h3>No matching facts.</h3>
          <p>Try another term or remove a filter.</p>
        </div>
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          <ArrowLeft size={15} />
          Previous
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / 30))}
        </span>
        <button
          className="secondary"
          disabled={(page + 1) * 30 >= (data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
          <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
function QuizSetup({
  boot,
  busy,
  run,
  onTeam,
  onCreate,
}: {
  boot: Bootstrap;
  busy: boolean;
  run: Run;
  onTeam: (t: Team) => void;
  onCreate: (q: Quiz) => void;
}) {
  const [teamId, setTeamId] = useState(boot.teams[0]?.id ?? ""),
    [teamName, setTeamName] = useState(boot.teams[0]?.name ?? ""),
    [members, setMembers] = useState(boot.teams[0]?.members.join("\n") ?? "");
  const [name, setName] = useState("Team practice"),
    [count, setCount] = useState(30),
    [topics, setTopics] = useState<string[]>([]),
    [studiedOnly, setStudiedOnly] = useState(false);
  const savedTeam = boot.teams.find((t) => t.id === teamId);
  const rosterDirty =
    !savedTeam ||
    savedTeam.name !== teamName ||
    savedTeam.members.join("\n") !== members;
  const selectTeam = (id: string) => {
    setTeamId(id);
    const team = boot.teams.find((t) => t.id === id);
    setTeamName(team?.name ?? "");
    setMembers(team?.members.join("\n") ?? "");
  };
  return (
    <div className="setup-grid">
      <section className="setup-section">
        <span className="step">01</span>
        <h2>Your team</h2>
        <label>
          Saved roster
          <select value={teamId} onChange={(e) => selectTeam(e.target.value)}>
            <option value="">New team</option>
            {boot.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team name
          <input
            placeholder="e.g. SPE ITB"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </label>
        <label>
          Member names <small>One per line</small>
          <textarea
            rows={4}
            placeholder={"Member one\nMember two\nMember three"}
            value={members}
            onChange={(e) => setMembers(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !teamName.trim() || !members.trim()}
          onClick={() =>
            void run(
              () =>
                api().saveTeam({
                  id: teamId,
                  name: teamName,
                  members: members
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                }),
              (t) => {
                onTeam(t);
                setTeamId(t.id);
              },
            )
          }
        >
          <Check size={15} />
          Save roster
        </button>
      </section>
      <section className="setup-section">
        <span className="step">02</span>
        <h2>The session</h2>
        <label>
          Session name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Questions
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <label>
            Question pool
            <select
              value={studiedOnly ? "studied" : "full"}
              onChange={(e) => setStudiedOnly(e.target.value === "studied")}
            >
              <option value="full">Full packaged bank</option>
              <option value="studied">Studied on this computer</option>
            </select>
          </label>
        </div>
        <TopicPicker
          topics={boot.topics}
          selected={topics}
          change={setTopics}
        />
        <p className="quiet">
          {topics.length ? `${topics.length} topics selected` : "All topics"}.
          Questions are balanced across topics and do not repeat the same fact.
        </p>
        <button
          className="primary"
          disabled={busy || !teamId || !name.trim() || rosterDirty}
          onClick={() =>
            void run(
              () =>
                api().createQuiz({ name, teamId, count, topics, studiedOnly }),
              onCreate,
            )
          }
        >
          Create quiz
          <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
function scores(q: Quiz) {
  return q.team.members
    .map((player) => ({
      player,
      correct: q.questions.reduce(
        (n, x) =>
          n + x.attempts.filter((a) => a.player === player && a.correct).length,
        0,
      ),
      wrong: q.questions.reduce(
        (n, x) =>
          n +
          x.attempts.filter((a) => a.player === player && !a.correct).length,
        0,
      ),
    }))
    .sort((a, b) => b.correct - a.correct);
}
function Scoreboard({ quiz }: { quiz: Quiz }) {
  const rows = scores(quiz);
  return (
    <table className="scoreboard">
      <thead>
        <tr>
          <th>Member</th>
          <th>Correct</th>
          <th>Wrong</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.player}>
            <td>
              <span className="rank">
                {rows.findIndex((x) => x.correct === r.correct) + 1}
              </span>
              {r.player}
            </td>
            <td>{r.correct}</td>
            <td>{r.wrong}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function QuizReport({
  quiz,
  enlarge,
  practice,
  undo,
}: {
  quiz: Quiz;
  enlarge: (f: Fact) => void;
  practice: (f: Fact[]) => void;
  undo: () => void;
}) {
  const correct = quiz.questions.filter((q) =>
    q.attempts.some((a) => a.correct),
  ).length;
  const missed = quiz.questions.filter(
    (q) => !q.attempts.some((a) => a.correct),
  );
  const topics = [...new Set(quiz.questions.flatMap((q) => q.fact.topics))];
  return (
    <>
      <div className="report-top">
        <div>
          <span className="eyebrow">
            COMPLETED SESSION · {date(quiz.startedAt)}
          </span>
          <h2>{quiz.name}</h2>
          <p>{quiz.team.name}</p>
        </div>
        <div className="report-accuracy">
          <strong>
            {Math.round((correct / quiz.questions.length) * 100)}
            <small>%</small>
          </strong>
          <span>
            {correct} of {quiz.questions.length} questions correct
          </span>
        </div>
      </div>
      <div className="report-grid">
        <section>
          <h2>Session results</h2>
          <Scoreboard quiz={quiz} />
          <p className="quiet">
            Correct counts determine rank; equal counts are tied. Results belong
            to this session only.
          </p>
        </section>
        <section>
          <h2>Topics in this quiz</h2>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Correct / asked</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => {
                const qs = quiz.questions.filter((q) =>
                  q.fact.topics.includes(t),
                );
                return (
                  <tr key={t}>
                    <td>{t}</td>
                    <td>
                      {
                        qs.filter((q) => q.attempts.some((a) => a.correct))
                          .length
                      }{" "}
                      / {qs.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="quiet">
            Topic totals overlap when questions have shared tags.
          </p>
        </section>
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>
            Questions to revisit <span className="count">{missed.length}</span>
          </h2>
          <button
            className="primary"
            disabled={!missed.length}
            onClick={() => practice(missed.map((q) => q.fact))}
          >
            Practice missed questions
            <ArrowRight size={16} />
          </button>
        </div>
        {missed.map((q) => (
          <details className="missed-question" key={q.fact.id}>
            <summary>
              {q.fact.quiz}
              <ChevronDown size={16} />
            </summary>
            <Answer fact={q.fact} enlarge={enlarge} />
          </details>
        ))}
        {!missed.length && (
          <p className="quiet">Every question received a correct answer.</p>
        )}
      </section>
      <details className="section">
        <summary>Full question log</summary>
        {quiz.questions.map((q, i) => (
          <div className="question-log" key={i}>
            <strong>
              {i + 1}. {q.fact.quiz}
            </strong>
            <span>
              {q.attempts
                .map((a) => `${a.player}: ${a.correct ? "correct" : "wrong"}`)
                .join(" · ") || "Unanswered"}
            </span>
            <span>Answer: {q.fact.answer}</span>
          </div>
        ))}
      </details>
      <button className="text-button" onClick={undo}>
        <RotateCcw size={15} />
        Reopen last result to correct it
      </button>
    </>
  );
}
function RecallChart({ data }: { data: Progress }) {
  const hasData = data.points.some((p) => p.accuracy !== null);
  if (!hasData)
    return (
      <div className="empty chart-empty">
        <LineChart size={33} />
        <h3>Your recall history will appear here.</h3>
        <p>Complete scheduled reviews on later days to build this chart.</p>
      </div>
    );
  let segment = "";
  const segments: string[] = [];
  data.points.forEach((p, i) => {
    if (p.accuracy === null) {
      if (segment) segments.push(segment);
      segment = "";
    } else
      segment += `${segment ? " L" : "M"}${50 + i * 22},${210 - p.accuracy * 180}`;
  });
  if (segment) segments.push(segment);
  return (
    <>
      <svg
        className="recall-chart"
        viewBox="0 0 680 255"
        role="img"
        aria-label="Rolling seven-day recall accuracy over the last 28 days"
      >
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              x1="48"
              x2="652"
              y1={210 - p * 180}
              y2={210 - p * 180}
              stroke="#e5eaea"
            />
            <text x="7" y={215 - p * 180} fill="#7a888a" fontSize="12">
              {p * 100}%
            </text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} stroke="#087c82" strokeWidth="3" fill="none" />
        ))}
        {data.points.map(
          (p, i) =>
            p.accuracy !== null && (
              <circle
                key={p.day}
                cx={50 + i * 22}
                cy={210 - p.accuracy * 180}
                r="3"
                fill="#087c82"
              >
                <title>
                  {p.day}: {Math.round(p.accuracy * 100)}% ({p.count} eligible
                  attempts)
                </title>
              </circle>
            ),
        )}
        <text x="48" y="242" fontSize="12" fill="#7a888a">
          {date(data.points[0].day + "T12:00:00")}
        </text>
        <text x="650" y="242" textAnchor="end" fontSize="12" fill="#7a888a">
          {date(data.points[27].day + "T12:00:00")}
        </text>
      </svg>
      <details className="sources">
        <summary>View chart data</summary>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Study day</th>
              <th>7-day recall</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((p) => (
              <tr key={p.day}>
                <td>{p.day}</td>
                <td>
                  {p.accuracy === null
                    ? "No data"
                    : `${Math.round(p.accuracy * 100)}%`}
                </td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
function Guide() {
  const [q, setQ] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE EACH SESSION COUNT</div>
          <h1>A guide to effective practice.</h1>
          <p>
            A small daily routine, honest ratings, and time between recalls.
          </p>
        </div>
        <CircleHelp size={34} className="heading-icon" />
      </div>
      <label className="search-box guide-search">
        <Search size={18} />
        <input
          aria-label="Search guide"
          placeholder="Search the guide…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="guide-grid">
        {guide
          .filter((g) =>
            (g.title + " " + g.text).toLowerCase().includes(q.toLowerCase()),
          )
          .map((g, i) => (
            <article key={g.title}>
              <span className="guide-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{g.title}</h2>
                <p>{g.text}</p>
              </div>
            </article>
          ))}
      </div>
      <DemoCard />
    </>
  );
}
function DemoCard() {
  const [shown, setShown] = useState(false),
    [rating, setRating] = useState<RatingName | null>(null);
  return (
    <section className="demo-card">
      <div>
        <span className="eyebrow">TRY THE CONTROLS</span>
        <h2>A practice card, with no record.</h2>
        <p>
          Which rock property is the fraction of bulk volume occupied by pores?
        </p>
      </div>
      {!shown ? (
        <button className="primary" onClick={() => setShown(true)}>
          Show demonstration answer
        </button>
      ) : (
        <>
          <div className="demo-answer">
            <strong>Porosity</strong>
            <p>
              Porosity describes pore volume. Permeability describes the ability
              to transmit fluid.
            </p>
            <svg
              viewBox="0 0 300 100"
              role="img"
              aria-label="Rock grains surround white pore spaces"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <circle
                  key={i}
                  cx={35 + (i % 5) * 56}
                  cy={25 + Math.floor(i / 5) * 50}
                  r="21"
                  fill="#c8b495"
                />
              ))}
            </svg>
          </div>
          <div className="demo-ratings">
            {ratingButtons.map((r) => (
              <button
                className="secondary"
                key={r.rating}
                onClick={() => setRating(r.rating)}
              >
                {r.title}
              </button>
            ))}
          </div>
          {rating && (
            <p className="demo-feedback">
              {rating === "again"
                ? "Forgotten: this would return to a learning step."
                : rating === "hard"
                  ? "Correct with difficulty: choose Hard only when you remembered."
                  : rating === "good"
                    ? "A normal correct recall: Good is the usual choice."
                    : "Immediate recall: Easy schedules a longer interval."}{" "}
              This demonstration has not changed your history.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => {
              setShown(false);
              setRating(null);
            }}
          >
            Reset demonstration
          </button>
        </>
      )}
    </section>
  );
}
function SettingsPage({
  boot,
  busy,
  save,
  run,
  restored,
}: {
  boot: Bootstrap;
  busy: boolean;
  save: (p: Partial<Settings>, onSaved?: () => void) => Promise<void>;
  run: Run;
  restored: () => Promise<void>;
}) {
  const [limit, setLimit] = useState(boot.settings.newPerDay),
    [retention, setRetention] = useState(
      Math.round(boot.settings.retention * 100),
    ),
    [notice, setNotice] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR LOCAL WORKSPACE</div>
          <h1>Settings & backups</h1>
          <p>Keep the routine manageable and your history safe.</p>
        </div>
      </div>
      <section className="settings-section">
        <div>
          <h2>Daily study</h2>
          <p>
            Changes affect future reviews. Existing due dates stay scheduled.
          </p>
        </div>
        <div className="settings-form">
          <label>
            New facts per day
            <input
              type="number"
              min={0}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
            <small>Choose zero to focus on your review backlog.</small>
          </label>
          <label>
            Desired retention
            <input
              type="number"
              min={80}
              max={97}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
            <small>
              Percent. Higher targets require more reviews. Default: 90%.
            </small>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void save({ newPerDay: limit, retention: retention / 100 }, () =>
                setNotice("Study settings saved."),
              )
            }
          >
            Save study settings
            <Check size={16} />
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Backups</h2>
          <p>
            Include your private study history, saved rosters, and quiz reports.
            Keep a copy on another drive.
          </p>
        </div>
        <div className="settings-form">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => api().exportBackup(),
                (p) => {
                  if (p) setNotice(`Backup saved to ${p}`);
                },
              )
            }
          >
            <HardDrive size={17} />
            Export learner backup
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => api().restoreBackup(),
                (ok) => {
                  if (ok) {
                    setNotice("Backup restored.");
                    void restored();
                  }
                },
              )
            }
          >
            <FolderOpen size={17} />
            Restore a backup
          </button>
          <p className="quiet">
            Restore validates the file and saves your current data before
            replacement.
          </p>
        </div>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="settings-section">
        <div>
          <h2>Installed collection</h2>
          <p>Question-bank updates arrive with developer releases.</p>
        </div>
        <div>
          <p>
            <strong>{boot.manifest.factCount.toLocaleString()} facts</strong> ·
            version {boot.manifest.version}
          </p>
          <p className="quiet">
            Built {date(boot.manifest.builtAt)}. Study days begin at 04:00 in
            your device’s local timezone.
          </p>
          {!boot.manifest.releaseReady && (
            <details className="content-status">
              <summary>Content preparation status</summary>
              <p>This development collection has outstanding content work.</p>
              <ul>
                {boot.manifest.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </>
  );
}
