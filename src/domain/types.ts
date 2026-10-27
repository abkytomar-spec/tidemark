export type Priority = 'low' | 'medium' | 'high';
export type Energy = 'low' | 'medium' | 'high';
export type LifeArea = 'fitness' | 'learning' | 'work' | 'money' | 'wellbeing' | 'home';
export type Appearance = 'system' | 'light' | 'dark';
export type GardenSeason = 'dawn' | 'rain' | 'moon';
export type Voice = 'gentle' | 'focused' | 'cheerful';
export type FocusWindow = 'learn' | 'morning' | 'afternoon' | 'evening';
export type Celebration = 'quiet' | 'full';
export type GymPlace = { id: string; name: string; latitude: number; longitude: number; radiusMeters: number };
export type Recurrence =
  | { type: 'one_time' }
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: number[] }
  | { type: 'monthly'; dayOfMonth: number };

export type Task = {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  color: string;
  estimatedMinutes: number;
  energy: Energy;
  scheduleDate: string;
  scheduleTime: string | null;
  recurrence: Recurrence;
  goalId: string | null;
  proofRequired: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskCompletion = {
  id: string;
  taskId: string;
  occurrenceDate: string;
  completedAt: string;
  points: number;
  hasProof: boolean;
  status?: 'complete' | 'pending_proof';
};

export type Goal = {
  id: string;
  title: string;
  description: string;
  area: LifeArea;
  trackingType: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline: string | null;
  color: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  gymType?: GymGoalType | null;
  gymSettings?: Record<string, unknown>;
};

export type Milestone = { id: string; goalId: string; label: string; targetValue: number; completedAt: string | null; position: number };
export type EntryStatus = 'complete' | 'pending_proof';

export type ProgressEntry = {
  id: string;
  goalId: string;
  area: LifeArea;
  entryType: string;
  metric: string;
  value: number;
  durationMinutes: number | null;
  details: Record<string, unknown>;
  note: string;
  occurrenceAt: string;
  status: EntryStatus;
  createdAt: string;
};

export type DailyCheckin = { id: string; date: string; energy: Energy; mood: 1 | 2 | 3 | 4 | 5; note: string; intention: string; win: string; gratitude: string };
export type ActivityEvent = { id: string; type: string; message: string; relatedType: string; relatedId: string; createdAt: string };
export type ProofPhoto = { id: string; ownerType: 'completion' | 'progress' | 'daily_moment'; ownerId: string; category?: 'gym' | 'goals' | 'tasks' | 'daily'; caption?: string; imageUrl: string; createdAt: string; selectedForRecap: boolean };
export type GlobalSafe = { scope: 'global'; stored: 0 | 1; qualifyingCount: number; lastProtectedDate: string | null };
export type DailyMomentSettings = { enabled: boolean; windowStart: string; windowEnd: string; notifications: boolean };
export type DailyMomentDay = { id: string; localDate: string; scheduledTime: string; status: 'scheduled' | 'sent' | 'captured' | 'skipped'; capturedAt: string | null; caption: string };
export type DailyMomentSnapshot = { settings: DailyMomentSettings; today: DailyMomentDay | null; days: DailyMomentDay[]; eligiblePrompt: boolean };
export type User = {
  id: string; email: string; timezone: string; enabledAreas: LifeArea[]; onboardingStep: string | null;
  displayName: string; appearance: Appearance; gardenSeason: GardenSeason; voice: Voice; focusWindow: FocusWindow; celebration: Celebration;
  contextualAmbience?: boolean; gymPlaces?: GymPlace[];
};

export type Snapshot = {
  serverTime: string;
  user: User;
  tasks: Task[];
  completions: TaskCompletion[];
  goals: Goal[];
  milestones: Milestone[];
  progressEntries: ProgressEntry[];
  checkins: DailyCheckin[];
  activities: ActivityEvent[];
  proofs: ProofPhoto[];
  globalSafe?: GlobalSafe;
  gym?: GymSnapshot;
  dailyMoment?: DailyMomentSnapshot;
};

export type GymGoalType = 'physique' | 'strength_pr' | 'body_measurements' | 'workout_consistency';
export type GymPlan = { id: string; primaryGoalId: string; restMode: 'fixed' | 'flexible'; fixedRestWeekdays: number[]; flexibleRestAllowance: 1 | 2; trainingWeekdays: number[]; weeklySessionTarget: number; weightUnit: 'kg' | 'lb'; measurementUnit: 'cm' | 'in'; effectiveFrom: string; effectiveTo: string | null };
export type RoutineExercise = { id: string; name: string; sets: Array<{ reps: number; load: number; warmup: boolean; rpe: number | null }> };
export type GymRoutine = { id: string; name: string; template: string | null; exercises: RoutineExercise[]; position: number; active: boolean; createdAt: string; updatedAt: string };
export type GymRestEvent = { id: string; date: string; kind: 'fixed' | 'flexible' };
export type GymSafe = { scope: 'gym'; stored: 0 | 1; qualifyingCount: number; lastProtectedDate: string | null };
export type WorkoutSet = { exercise: string; reps: number; load: number; warmup: boolean; rpe: number | null };
export type WorkoutDetails = { routineId: string | null; routineName: string; sets: WorkoutSet[]; startedAt: string; plannedState: 'training' | 'rest' | 'open' };
export type GymSnapshot = { plans: GymPlan[]; routines: GymRoutine[]; restEvents: GymRestEvent[]; safe: GymSafe };
export type GymDayState = { kind: 'training' | 'rest' | 'open' | 'complete' | 'missed'; scheduled: boolean; canUndoRest: boolean; canTrainAnyway: boolean; remainingFlexibleRest: number };
export type GymStreakResult = { current: number; best: number; preservedByRest: boolean; pendingSafeDate: string | null; comeback: boolean };
