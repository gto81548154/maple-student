import { useRef, useState } from "react";
import { getPendingVideoWatch } from "../core/videoWatch.jsx";

// [120차수] 강의 보기 상태 칸과 시청 시간 재는 즉시값(ref) — App.jsx에서 그대로 옮김. 효과는 없다.
export function useVideoState() {
  const [viewingVideo, setViewingVideo] = useState(null);
  const [viewStartTime, setViewStartTime] = useState(null);
  const [videoWatch, setVideoWatch] = useState({});
  const [selectedVideoBook, setSelectedVideoBook] = useState(null); // 영상 탭 책별 sub-tab 선택값 (null이면 첫 책 자동)
  // [108차수 09-08 · 검토 1번] 강의 탭 대표 강의는 탭에 "들어갈 때" 한 번 정해서 고정한다(영상 id).
  //   107차수는 매 렌더마다 "최근 본 강의"로 다시 계산했는데, 다른 영상을 15초 보면 자동 저장으로 그 영상이 최근 강의가 되어
  //   대표 카드로 자리를 옮기면서 플레이어가 새로 만들어졌다(재생 끊김). 이제 시청 기록이 바뀌어도 대표 카드는 안 움직인다.
  //   탭을 나갔다 다시 들어오면(goTab) 그때 다시 정한다. null = 대표 카드 없음(목록만).
  const [videosFeaturedId, setVideosFeaturedId] = useState(null);
  const [pendingVideoCount, setPendingVideoCount] = useState(() => getPendingVideoWatch().length); // 저장 실패/대기 기록 개수
  const [lastVideoSaveStatus, setLastVideoSaveStatus] = useState(""); // 최근 영상 기록 저장 상태 표시
  // 이탈 추적용 ref (state로 안 쓰는 이유: 매 visibilitychange마다 리렌더 안 시키기 위함)
  const awayStartRef = useRef(null);   // 영상 재생 중 이탈 시작 시각(Date.now() 또는 null)
  const activeSecRef = useRef(0);      // 실제 재생 + 화면 활성 상태였던 시간
  const awaySecRef = useRef(0);        // 실제 재생 중 이탈 시간(5초+ 만)
  const awayCountRef = useRef(0);      // 실제 재생 중 이탈 횟수(5초+ 만)
  const longestAwayRef = useRef(0);    // 가장 길었던 이탈(초)
  const lastActiveAtRef = useRef(null); // 구버전 호환용: 새 방식에서는 직접 누적하지 않음
  const currentSessionIdRef = useRef(null); // 현재 열려 있는 영상 세션 ID(중복 저장 방지용)
  const ytPlaySecRef = useRef(0);      // YouTube PLAYING 상태에서만 누적한 실제 재생시간
  const ytFocusSecRef = useRef(0);     // PLAYING + 학생앱 화면이 보이는 시간
  const ytDurationSecRef = useRef(0);  // YouTube 플레이어가 알려준 실제 영상 길이
  const ytPlayerStateRef = useRef(null); // 마지막 YouTube 플레이어 상태값
  const lastSavedPlaySecRef = useRef(0);   // Worker/대기열에 이미 반영한 실제 재생시간
  const lastSavedFocusSecRef = useRef(0);  // Worker/대기열에 이미 반영한 화면 활성 재생시간
  const lastSavedAwaySecRef = useRef(0);   // Worker/대기열에 이미 반영한 이탈 시간
  const lastSavedAwayCountRef = useRef(0); // Worker/대기열에 이미 반영한 이탈 횟수
  const videoSaveChunkSeqRef = useRef(0);  // 자동 저장 조각 ID 충돌 방지
  const videoSaveInFlightRef = useRef(false); // 자동 저장 중복 호출 방지
  return { activeSecRef, awayCountRef, awaySecRef, awayStartRef, currentSessionIdRef, lastActiveAtRef, lastSavedAwayCountRef, lastSavedAwaySecRef, lastSavedFocusSecRef, lastSavedPlaySecRef, lastVideoSaveStatus, longestAwayRef, pendingVideoCount, selectedVideoBook, setLastVideoSaveStatus, setPendingVideoCount, setSelectedVideoBook, setVideoWatch, setVideosFeaturedId, setViewStartTime, setViewingVideo, videoSaveChunkSeqRef, videoSaveInFlightRef, videoWatch, videosFeaturedId, viewStartTime, viewingVideo, ytDurationSecRef, ytFocusSecRef, ytPlaySecRef, ytPlayerStateRef };
}
