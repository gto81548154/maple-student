import { useEffect, useRef, useState } from "react";

// [120차수] 서버에서 받은 자료를 담는 상태 칸(학생·숙제·체크·강의·시험·설문 등)과 불러오는 중/오류 표시 — App.jsx에서 그대로 옮김.
export function useBundleState() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadErrorCode, setLoadErrorCode] = useState(""); // [08-10] 연결 오류 화면에 표시할 짧은 오류 코드
  const [loadingSlow, setLoadingSlow] = useState(false);   // [110차수] 첫 화면이 6초 넘게 걸리면 "서버가 느려요" 한 줄
  useEffect(() => {
    if (!loading) { setLoadingSlow(false); return; }
    const t = setTimeout(() => setLoadingSlow(true), 6000);
    return () => clearTimeout(t);
  }, [loading]);
  const [withdrawnName, setWithdrawnName] = useState(""); // [08-07] 그만둔 학생 안내에 이름을 넣기 위해
  const [masterWithdrawn, setMasterWithdrawn] = useState(false); // [08-07] 마스터가 그만둔 학생 화면을 볼 때 띄우는 띠
  const [student, setStudent] = useState(null);
  const [todos, setTodos] = useState({});
  const [checklistData, setChecklistData] = useState({});
  const [records, setRecords] = useState({});
  const [videos, setVideos] = useState([]);
  const [makeups, setMakeups] = useState([]);
  const [customHolidays, setCustomHolidays] = useState({});
  const [exams, setExams] = useState([]);
  const [examRanges, setExamRanges] = useState(null); // 시험범위(examr3) — 워커가 본인 학교 항목만 전달, 읽기 전용
  const [vocabWrongWords, setVocabWrongWords] = useState({});
  // [137차수] 서버 묶음에 실려 온 내 단어숙제 도장. undefined = 아직 서버 답 전 · false = 이 서버는 도장을 안 줌(옛 워커·못 읽음·폰 저장본) · {날짜:도장} = 받음
  const [bundleVocaHw, setBundleVocaHw] = useState(undefined);
  const [progressTree, setProgressTree] = useState(null); // 원장앱 진도 트리(ptree3) — 읽기 전용
  const [attLog, setAttLog] = useState({}); // [일정] 등하원 기록(att_log3) — 읽기 전용
  const [attStatus, setAttStatus] = useState({}); // [출결] 결석/지각(att3) — 읽기 전용
  const [surveys, setSurveys] = useState([]); // [설문] 진행 중 설문(svy3) — 본인 대상만
  const [surveyResponses, setSurveyResponses] = useState({}); // [설문] 본인 응답(svyr3)
  const [refreshing, setRefreshing] = useState(false); // 수동 새로고침 상태
  const [syncSource, setSyncSource] = useState(""); // worker
  const [lastLoadedAt, setLastLoadedAt] = useState(null); // 마지막 동기화 시각
  const [videoStatsUnavailable, setVideoStatsUnavailable] = useState(false);
  const displayedBundleRef = useRef(null); // 저장 공간이 막혀도 현재 정상 화면을 유지한다.
  const [offlineNotice, setOfflineNotice] = useState(""); // Worker 실패 시 로컬 백업 표시 안내
  return { bundleVocaHw, setBundleVocaHw, attLog, attStatus, checklistData, customHolidays, displayedBundleRef, error, examRanges, exams, lastLoadedAt, loadErrorCode, loading, loadingSlow, makeups, masterWithdrawn, offlineNotice, progressTree, records, refreshing, setAttLog, setAttStatus, setChecklistData, setCustomHolidays, setError, setExamRanges, setExams, setLastLoadedAt, setLoadErrorCode, setLoading, setMakeups, setMasterWithdrawn, setOfflineNotice, setProgressTree, setRecords, setRefreshing, setStudent, setSurveyResponses, setSurveys, setSyncSource, setTodos, setVideoStatsUnavailable, setVideos, setVocabWrongWords, setWithdrawnName, student, surveyResponses, surveys, syncSource, todos, videoStatsUnavailable, videos, vocabWrongWords, withdrawnName };
}
