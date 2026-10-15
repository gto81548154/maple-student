import { TAP } from "../theme/tokens.jsx";
import { useEffect, useState } from "react";
// [4차] QR 만드는 라이브러리. 앱 안에 같이 들어가므로 인터넷 없이도 QR이 그려진다.
//       설치: npm install qrcode   (예전에 쓰던 cdnjs qrcodejs와는 다른 물건이다)
import QRCodeLib from "qrcode";

// ─── QR 그리기: 값 하나를 QR 그림으로 (출석 QR·카톡 문의 QR 공용) ───
// [4차] 예전에는 QR 만드는 코드를 그때그때 인터넷(cdnjs)에서 내려받았다.
//       학원 와이파이가 끊기면 QR이 안 나왔다. 이제는 앱 안에 들어있는 qrcode로 그린다.
//       실패하면 하얀 네모를 남기지 않고 "왜 안 되는지"를 글자로 보여준다.
//       그림(img)으로 그리는 이유: 좁은 폰에서도 정사각형을 지키며 저절로 줄어들어 잘리지 않는다.
export function QrBox({ value, size = 168 }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setFailed(false);
    const text = value == null ? "" : String(value);
    // 값이 비어 있으면(예: 열쇠값 누락) 만들어봐야 스캔이 안 되므로 바로 안내를 띄운다.
    if (!text) { setFailed(true); return undefined; }
    // 화면 크기의 2배로 만들어 두면 고화질 폰에서도 또렷하다. 실제 표시 크기는 아래 style이 정한다.
    QRCodeLib.toDataURL(text, { width: Math.round(size * 2), margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (!cancelled) { setSrc(url); setFailed(false); } })
      .catch(() => { if (!cancelled) { setSrc(""); setFailed(true); } });
    return () => { cancelled = true; };
  }, [value, size]);

  return (
    <div style={{ display: "inline-flex", padding: 8, background: "#fff", borderRadius: 10, border: "1px solid #eef0f3", maxWidth: "100%", boxSizing: "border-box" }}>
      {failed ? (
        <div style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#c0392b", lineHeight: 1.6, padding: 12, boxSizing: "border-box" }}>
          QR을 못 만들었어요<br />데스크 선생님께<br />이름을 말해주세요
        </div>
      ) : src ? (
        <img
          src={src}
          alt="QR"
          style={{ display: "block", width: size, maxWidth: "100%", height: "auto", background: "#fff" }}
        />
      ) : (
        // 만드는 중(아주 잠깐). 빈 img를 두면 깨진 그림 아이콘이 뜨므로 빈 칸으로 자리만 잡아둔다.
        <div style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", background: "#fff" }} />
      )}
    </div>
  );
}
// ─── 출석 QR 모달: 데스크에서 스캔할 개인 QR(maple-att:{id}:{token}) ───
// [4차] QR 그리는 코드를 따로 갖고 있지 않고 QrBox를 그대로 쓴다(크기만 240으로 넘김).
//       고칠 일이 생기면 QrBox 한 군데만 고치면 된다.
export function AttQrModal({ value, studentName, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "24px 20px 20px", width: "100%", maxWidth: 340, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", boxSizing: "border-box" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C66A5", marginBottom: 2 }}>출석 QR</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#2A2A28", marginBottom: 16 }}>{studentName}</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <QrBox value={value} size={240} />
        </div>
        <div style={{ fontSize: 12, color: "#8b909a", marginTop: 14, lineHeight: 1.5 }}>데스크 선생님께 이 화면을 보여주세요</div>
        <button onClick={onClose} style={{ minHeight: TAP, marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>닫기</button>
      </div>
    </div>
  );
}
