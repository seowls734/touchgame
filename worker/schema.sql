-- 터치게임 온라인 랭킹 D1 스키마
-- id     : 기기마다 생성되는 식별자(클라이언트 localStorage에 보관)
-- secret : 기록의 주인임을 증명하는 값의 SHA-256 해시. 평문은 서버에 남지 않는다.
CREATE TABLE IF NOT EXISTS ranks (
  id        TEXT PRIMARY KEY,
  secret    TEXT NOT NULL,
  name      TEXT NOT NULL,
  stage     INTEGER NOT NULL,
  prestiges INTEGER NOT NULL,
  dps       REAL    NOT NULL,
  gold      REAL    NOT NULL,
  kills     INTEGER NOT NULL,
  rp        REAL    NOT NULL,
  at        INTEGER NOT NULL
);

-- 순위표는 항상 rp 내림차순으로 조회한다
CREATE INDEX IF NOT EXISTS idx_ranks_rp ON ranks (rp DESC);
