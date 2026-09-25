export const asset = (name) => `/assets/${name}`;

export const bodyTypes = [
  ["THIN", "마른"],
  ["LEAN_MUSCULAR", "슬림 근육"],
  ["AVERAGE", "보통"],
  ["MUSCULAR", "근육질"],
  ["CHUBBY", "통통"],
  ["LARGE_BUILD", "우람"],
];

export const educationLevels = [
  ["HIGH_SCHOOL", "고등학교"],
  ["ASSOCIATE", "전문대"],
  ["BACHELOR", "대학교"],
  ["MASTER", "석사"],
  ["DOCTORATE", "박사"],
  ["OTHER", "기타"],
];

export const religions = [
  ["NONE", "무교"],
  ["PROTESTANT", "기독교"],
  ["CATHOLIC", "천주교"],
  ["BUDDHIST", "불교"],
  ["OTHER", "기타"],
];

export const drinkings = [
  ["NEVER", "안 마셔요"],
  ["SOCIAL", "사회적 음주"],
  ["OCCASIONAL", "가끔 마셔요"],
  ["FREQUENT", "자주 마셔요"],
];

export const smokings = [
  ["NON_SMOKER", "안 해요"],
  ["OCCASIONAL", "가끔 해요"],
  ["FREQUENT", "자주 해요"],
];

export const mbtis = [
  "ISTJ",
  "ISFJ",
  "INFJ",
  "INTJ",
  "ISTP",
  "ISFP",
  "INFP",
  "INTP",
  "ESTP",
  "ESFP",
  "ENFP",
  "ENTP",
  "ESTJ",
  "ESFJ",
  "ENFJ",
  "ENTJ",
];

export const questions = [
  "주말에 갑자기 약속이 취소되면 어떤 편이세요?",
  "새로운 사람과 친해질 때 무엇이 가장 중요한가요?",
  "서로 의견이 다를 때 어떻게 이야기하는 편인가요?",
  "하루 중 가장 편안함을 느끼는 순간은 언제인가요?",
  "연락은 얼마나 자주 주고받는 게 편한가요?",
  "처음 만나는 사람과 하고 싶은 활동은 무엇인가요?",
  "상대가 힘든 하루를 보냈다면 어떻게 해주고 싶나요?",
  "연애할 때 서로에게 꼭 필요한 시간은 무엇인가요?",
  "함께하고 싶은 주말은 어떤 모습인가요?",
  "좋은 관계를 오래 이어가는 데 가장 중요한 건 무엇인가요?",
];

export const initialProfile = {
  name: "",
  birthDate: "",
  gender: "",
  nickname: "",
  activityRegionId: null,
  regionName: "",
  height: "",
  bodyType: "",
  educationLevel: "",
  job: "",
  religion: "",
  drinking: "",
  smoking: "",
  mbti: "",
  photo: "",
};

export const demoRecommendations = [
  {
    id: 12,
    nickname: "카피바라",
    age: 28,
    job: "개발자",
    region: "서울 마포구",
    mbti: "ENFP",
    verified: true,
    activity: "오늘 접속",
    photo: asset("hero.png"),
    bio: "안녕하세요! 새로운 카페를 찾거나 한강을 산책하는 걸 좋아해요. 천천히 알아가며 편하게 대화하고 싶어요.",
  },
  {
    id: 21,
    nickname: "달비",
    age: 24,
    job: "대학생",
    region: "서울 강동구",
    mbti: "ISFP",
    verified: true,
    activity: "이번 주 접속",
    photo: "",
    bio: "영화와 음악을 좋아해요. 일상 이야기를 나누며 가까워지고 싶어요.",
  },
  {
    id: 34,
    nickname: "뇽2뇽",
    age: 28,
    job: "회사원",
    region: "경기 성남시",
    mbti: "INFJ",
    verified: false,
    activity: "오늘 접속",
    photo: "",
    bio: "맛있는 것 먹으러 가는 걸 좋아해요. 서로의 속도를 존중하는 만남을 기대해요.",
  },
];

export const demoRooms = [
  {
    id: 101,
    personId: 12,
    name: "민민",
    image: asset("user-avatar.png"),
    last: "이번 주말에 시간 괜찮으세요?",
    time: "오후 1:42",
    unread: 2,
  },
  {
    id: 102,
    personId: 21,
    name: "달비",
    image: "",
    last: "저도 반가워요!",
    time: "어제",
    unread: 0,
  },
];

export const demoMessages = {
  101: [
    {
      id: 1,
      mine: false,
      text: "안녕하세요! 프로필 보고 반가워서 연락드렸어요 :)",
      time: "오후 1:37",
    },
    { id: 2, mine: true, text: "안녕하세요, 저도 반가워요", time: "오후 1:40" },
    {
      id: 3,
      mine: false,
      text: "혹시 이번 주말에 시간 어떠세요?",
      time: "오후 1:42",
    },
  ],
  102: [
    { id: 4, mine: false, text: "안녕하세요!", time: "어제" },
    { id: 5, mine: true, text: "저도 반가워요!", time: "어제" },
  ],
};

export const demoNotifications = [
  {
    id: 1,
    type: "LIKE",
    title: "관심을 받았어요",
    body: "뇽2뇽님이 회원님에게 관심을 보냈어요",
    when: "10분 전",
    read: false,
    target: "/likes",
  },
  {
    id: 2,
    type: "CHAT_MESSAGE",
    title: "새 메시지",
    body: "민민님: 이번 주말에 시간 괜찮으세요?",
    when: "42분 전",
    read: false,
    target: "/chats/101",
  },
  {
    id: 3,
    type: "PERSONA_TRAINING_COMPLETED",
    title: "페르소나 학습 완료",
    body: "나의 AI가 새로운 대화를 배웠어요",
    when: "2시간 전",
    read: true,
    target: "/my",
  },
];

export const simulationScript = [
  ["mine", "개발자라고 봤어요. 요즘 퇴근하고 가장 자주 하는 게 뭐예요?"],
  [
    "theirs",
    "산책하거나 새로 생긴 카페 찾아가는 편이에요. 마포 쪽은 자주 가세요?",
  ],
  ["mine", "네, 저도 카페 찾아다니는 걸 좋아해요. 요즘 추천하는 곳 있나요?"],
  [
    "theirs",
    "작은 책방이 있는 카페를 좋아해요. 조용해서 이야기하기 좋더라고요.",
  ],
  ["mine", "좋네요. 주말에는 보통 어떻게 시간을 보내세요?"],
  ["theirs", "느긋하게 산책하고 맛있는 걸 먹어요. 그쪽은요?"],
  ["mine", "저도 비슷해요. 취향이 맞는 것 같아서 반갑네요."],
  ["theirs", "저도요. 이야기 나누는 게 편안했어요!"],
];

export function makeInitialState() {
  return {
    session: false,
    onboarded: false,
    onboardingStep: "terms",
    agreed: false,
    terms: [false, false, false, false],
    profile: { ...initialProfile },
    questionIndex: 0,
    answers: [],
    passedIds: [],
    sentLikes: [],
    receivedLikes: [34, 21],
    matches: [],
    rooms: demoRooms,
    messages: demoMessages,
    notifications: demoNotifications,
    practice: {},
    simulations: {},
    preferences: { minAge: 19, maxAge: 39, minHeight: 130, maxHeight: 220 },
  };
}
