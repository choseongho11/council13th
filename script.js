let activeMembers = [];
let isAdmin = false;

// 날짜 포맷 정규화: 2026-02-03 → 2026.02.03
function formatDate(raw) {
    if (!raw) return '';
    const cleaned = raw.trim().replace(/-/g, '.');
    return cleaned.replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/, (_, y, mo, d) =>
        `${y}.${mo.padStart(2,'0')}.${d.padStart(2,'0')}`
    );
}

// ===== 시스템 로그인 =====
const SYSTEM_PASSWORD = 'a12345';

function doLogin() {
    const input = document.getElementById('loginPassword');
    const errorEl = document.getElementById('loginError');
    if (input.value === SYSTEM_PASSWORD) {
        document.getElementById('loginScreen').classList.add('hidden');
        input.value = '';
        errorEl.textContent = '';
    } else {
        errorEl.textContent = '암호가 올바르지 않습니다.';
        input.select();
    }
}

const LS_KEY = 'councilMembersData_v1';
const LS_VER_KEY = 'councilMembersData_version';

// localStorage에 현재 의원 데이터 저장 (버전 정보 함께 저장)
function saveToLocalStorage() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(activeMembers));
        if (typeof MEMBERS_DATA_VERSION !== 'undefined') {
            localStorage.setItem(LS_VER_KEY, MEMBERS_DATA_VERSION);
        }
    } catch(err) {
        console.warn('localStorage 저장 실패:', err);
    }
}

// localStorage에서 의원 데이터 불러오기 (있으면 true 반환)
// membersData.js의 버전이 다르면 localStorage 캐시를 무효화하고 false 반환
function loadFromLocalStorage() {
    try {
        const currentVer = typeof MEMBERS_DATA_VERSION !== 'undefined' ? MEMBERS_DATA_VERSION : null;
        const savedVer = localStorage.getItem(LS_VER_KEY);

        if (currentVer && savedVer !== currentVer) {
            // 버전 불일치 → 캐시 삭제 후 membersData.js 우선 사용
            console.info(`[데이터 업데이트] localStorage 버전(${savedVer}) → membersData.js 버전(${currentVer})으로 교체합니다.`);
            localStorage.removeItem(LS_KEY);
            localStorage.removeItem(LS_VER_KEY);
            return false;
        }

        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                activeMembers = parsed;
                return true;
            }
        }
    } catch(err) {
        console.warn('localStorage 불러오기 실패:', err);
    }
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    // localStorage 우선 → 없으면 기본 membersData.js 사용
    if (!loadFromLocalStorage()) {
        if (typeof membersData !== 'undefined') activeMembers = [...membersData];
    }
    renderDropdown();

    document.getElementById('excelUpload').addEventListener('change', handleExcelUpload);
    document.getElementById('txtUpload').addEventListener('change', handleTxtUpload);
    document.getElementById('downloadTemplateBtn').addEventListener('click', downloadExcelTemplate);
    document.getElementById('memberSelect').addEventListener('change', (e) => applyMemberData(e.target.value));

    // 사진 업로드
    document.getElementById('memberPhotoUpload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const memberId = document.getElementById('memberSelect').value;
        if (!memberId) return alert('먼저 의원을 선택하세요.');
        const reader = new FileReader();
        reader.onload = (ev) => {
            compressPhoto(ev.target.result, 240, 300, 0.65, (compressed) => {
                const member = activeMembers.find(m => m.id === memberId);
                if (member) {
                    member.photo = compressed;
                    try {
                        saveToLocalStorage();
                    } catch(e) {
                        alert('저장 공간이 부족합니다. 일부 의원의 사진을 삭제 후 다시 시도하세요.');
                        delete member.photo;
                        showMemberPhoto(null);
                        return;
                    }
                }
                showMemberPhoto(compressed);
            });
        };
        reader.onerror = () => alert('파일을 읽는 중 오류가 발생했습니다.');
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    // 사진 삭제
    document.getElementById('memberPhotoDeleteBtn').addEventListener('click', () => {
        const memberId = document.getElementById('memberSelect').value;
        if (!memberId) return;
        const member = activeMembers.find(m => m.id === memberId);
        if (member) {
            delete member.photo;
            saveToLocalStorage();
        }
        showMemberPhoto(null);
    });
    
    document.getElementById('memberSearch').addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        if (!term) return;
        const select = document.getElementById('memberSelect');
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.toLowerCase().includes(term) && select.options[i].value !== "") {
                select.value = select.options[i].value;
                applyMemberData(select.value);
                break;
            }
        }
    });
    
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('resetBtn').addEventListener('click', () => {
        const pw = prompt('보안을 위해 관리자 비밀번호를 입력해주세요.\n(전체 데이터가 초기화되며 기본 데이터로 복구됩니다.)');
        if (pw === 'admin1234') {
            if(confirm('정말로 전체 초기화를 진행하시겠습니까?\n업로드된 모든 데이터가 삭제되고 기본 내장 데이터로 돌아갑니다.')) {
                localStorage.removeItem(LS_KEY);
                localStorage.removeItem(LS_VER_KEY);
                location.reload();
            }
        } else if (pw !== null) {
            alert('비밀번호가 일치하지 않습니다.');
        }
    });

    document.getElementById('clearActivitiesBtn').addEventListener('click', () => {
        const pw = prompt('보안을 위해 관리자 비밀번호를 입력해주세요.\n(활동 내역이 모두 삭제되며, 신상 정보만 남게 됩니다.)');
        if (pw === 'admin1234') {
            if(confirm('정말로 모든 의원의 활동 내역(5분발언, 조례안, 상임위 등)을 삭제하시겠습니까?')) {
                activeMembers.forEach(m => {
                    m.activities_5min = "";
                    m.activities_question = "";
                    m.activities_bill = "";
                    m.activities_suggestion = "";
                    m.activities_debate = "";
                    m.activities_research = "";
                    m.standing_coms = [];
                    m.audit_coms = [];
                });
                saveToLocalStorage();
                alert('모든 활동 내역이 초기화되었습니다.');
                location.reload();
            }
        } else if (pw !== null) {
            alert('비밀번호가 일치하지 않습니다.');
        }
    });

    setupAdminAuthLogic();

    // Set Default if valid
    if(activeMembers.length > 0) {
        const firstMemberId = activeMembers[0].id;
        document.getElementById('memberSelect').value = firstMemberId;
        applyMemberData(firstMemberId);
    } else {
        // 의원이 아무도 없을 경우 화면 비우기
        const fields = ['constituency','name','party','gender','birthDate','address','education','career','region','committee1','committee2'];
        fields.forEach(f => { const el = document.getElementById(`td-${f}`); if(el) el.innerHTML = ''; });
        document.getElementById('plenaryActivities').innerHTML = '';
        document.getElementById('committeeActivities').innerHTML = '';
    }
});

// ----------------------------------------------------------------------------------
// Auth Logic (User vs Admin Mode)
// ----------------------------------------------------------------------------------

function setupAdminAuthLogic() {
    const authBtn = document.getElementById('adminToggleBtn');
    authBtn.addEventListener('click', () => {
        if (isAdmin) {
            if(confirm('관리자 모드를 종료하고 일반 화면으로 돌아가시겠습니까?')) disableAdminMode();
        } else {
            document.getElementById('loginModal').classList.add('active');
            document.getElementById('adminPassword').value = '';
            setTimeout(() => document.getElementById('adminPassword').focus(), 100);
        }
    });

    if (sessionStorage.getItem('isAdmin') === 'true') {
        enableAdminMode();
    } else {
        disableAdminMode();
    }
}

function checkPassword() {
    const pw = document.getElementById('adminPassword').value;
    if (pw === 'admin1234') {
        enableAdminMode();
        closeModal();
    } else {
        alert('비밀번호가 일치하지 않습니다.');
    }
}

function closeModal() {
    document.getElementById('loginModal').classList.remove('active');
}

// ----------------------------------------------------------------------------------
// Bulk Excel Generator Logic
// ----------------------------------------------------------------------------------

// 상임위 활동 정렬 헬퍼: 회기 번호(숫자) 기준 내림차순
function sortStandingComs(list) {
    if (!list || !Array.isArray(list)) return [];
    const getSessionNum = (title) => {
        const m = (title || "").match(/제\s*(\d+)\s*회/);
        if (m) return parseInt(m[1]);
        const ym = (title || "").match(/(20\d{2})/);
        if (ym) return parseInt(ym[1]);
        return parseInt(((title || "").match(/\d+/) || ["0"])[0]) || 0;
    };
    return [...list].sort((a, b) => {
        const numA = getSessionNum(a.title);
        const numB = getSessionNum(b.title);
        return numB - numA; // 내림차순
    });
}

function generateBulkExcel() {
    const categories = {
        '5min': document.getElementById('bulkData_5min').value,
        'question': document.getElementById('bulkData_question').value,
        'bill': document.getElementById('bulkData_bill').value,
        'suggestion': document.getElementById('bulkData_suggestion').value,
        'debate': document.getElementById('bulkData_debate') ? document.getElementById('bulkData_debate').value : '',
        'research': document.getElementById('bulkData_research').value,
        'committee': document.getElementById('bulkData_committee') ? document.getElementById('bulkData_committee').value : '',
        'audit': document.getElementById('bulkData_audit') ? document.getElementById('bulkData_audit').value : ''
    };

    let targetMembers = [];
    if (activeMembers && activeMembers.length > 0) {
        targetMembers = [...activeMembers];
    } else {
        alert("기본 명단 데이터가 없습니다.\n먼저 [엑셀 파일 업로드]로 의원 명단을 불러오세요.");
        return;
    }

    let bulkResults = {};
    targetMembers.forEach(m => {
        bulkResults[m.name] = {
            '5min': [], 'question': [], 'bill': [], 'suggestion': [], 'debate': [], 'research': [],
            'committee': [], 'audit': []
        };
        // 기존 상임위 데이터 보존
        if (m.standing_coms) {
            m.standing_coms.forEach(sc => {
                if (sc.title || sc.content) {
                    bulkResults[m.name]['committee'].push({ title: sc.title || '', content: sc.content || '' });
                }
            });
        }
        // 기존 행감 데이터 보존
        if (m.audit_coms) {
            m.audit_coms.forEach(ac => {
                if (ac.title || ac.content) {
                    bulkResults[m.name]['audit'].push({ title: ac.title || '', content: ac.content || '' });
                }
            });
        }
    });

    // ------------------------------------------------------------------
    // 탭 구분 표 형식 파싱 (5분발언·도정질문·대표발의조례·건의안)
    //
    // 5분발언 컬럼 순서: 번호(0) 회수(1) 제목(2) 발언의원(3) 회의일자(4)
    // 도정질문 컬럼 순서: 번호(0) 회수(1) 제목(2) 질문의원(3) 답변자(4) 회의일(5)
    // nameCol  : 의원이름 컬럼 인덱스
    // titleCol : 제목 컬럼 인덱스
    // dateCol  : 날짜 컬럼 인덱스 (-1 이면 날짜 없음)
    // ------------------------------------------------------------------
    function parseTabularData(text, categoryKey, nameCol, titleCol, dateCol) {
        if (!text || !text.trim()) return;

        // 1. 초정밀 레코드 분리 (줄바꿈 + 숫자 + 공백/탭 패턴)
        const rawText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const splitter = "[[RECORD_SEP]]";
        
        // 맨 앞에 줄바꿈 추가 후, "줄바꿈 + 숫자 + 탭/공백" 패턴을 추적
        const normalizedText = ("\n" + rawText).replace(/\n\s*(\d+)([\t\s]+)/g, (match, p1, p2) => {
            // 탭문자가 포함되어 있거나 공백이 2개 이상일 때만 확실한 구분자로 인식
            if (p2.includes('\t') || p2.length >= 2 || /^\d+$/.test(p1)) {
                return splitter + p1 + "\t"; // 구분자 삽입 및 표준 탭으로 통일
            }
            return match;
        });
        
        const segments = normalizedText.split(splitter);
        const requiredCols = Math.max(nameCol, titleCol, dateCol >= 0 ? dateCol : 0) + 1;

        segments.forEach(segment => {
            const tr = segment.trim();
            if (!tr) return;
            
            // 모든 공백과 탭으로 일단 쪼갬 (2개 이상의 공백 또는 탭)
            let cols = tr.split(/[\t]{1,}|[\s]{2,}/);
            if (cols.length < 2) {
                // 잘 안 쪼개지면 탭으로만 시도
                cols = tr.split('\t');
            }

            let memberName = "";
            let title      = "";
            let dateRaw    = "";
            let session    = "";
            let result     = "";

            // --- 고도화된 내용 기반 매핑 (Robust Content-Aware Matcher) ---
            
            // 1) 의원명 찾기: 모든 컬럼을 순회하며 등록된 의원 이름이 포함되어 있는지 확인
            let matchedMember = null;
            let memberColIdx = -1;

            // 컬럼별로 정확히 일치하는 이름 찾기
            for (let i = 0; i < cols.length; i++) {
                const colVal = cols[i].trim();
                if (!colVal) continue;
                const found = targetMembers.find(m => colVal === m.name || colVal.startsWith(m.name + " ") || colVal.endsWith(" " + m.name) || colVal === m.name + "의원");
                if (found) {
                    matchedMember = found;
                    memberName = found.name;
                    memberColIdx = i;
                    break;
                }
            }

            // 2) 컬럼별로 못 찾았을 경우 문장 전체에서 찾기 (가장 긴 매칭 우선)
            if (!matchedMember) {
                for (const m of targetMembers) {
                    if (tr.includes(m.name)) {
                        matchedMember = m;
                        memberName = m.name;
                        break;
                    }
                }
            }

            if (!matchedMember) return; // 의원을 찾지 못하면 건너뜀

            // 3) 회기(Session) 추출: '제345회' 패턴을 최우선으로 찾고, 없으면 중간에 있는 3자리 숫자를 찾음
            // 맨 앞의 숫자(연번)는 제외하기 위해 '제...회' 패턴을 먼저 검색하고, 
            // 단순 숫자는 문장 중간(\s\d{3}\s)이나 뒤쪽에서 먼저 찾아보도록 순서를 조정합니다.
            const sessionPattern1 = tr.match(/제\s*(\d{1,4})\s*회/); // 제345회
            const sessionPattern2 = tr.match(/(\d{1,4})\s*회/);   // 345회
            const sessionPattern3 = tr.match(/(?<!^)\b(\d{3})\b/); // 줄 맨 앞이 아닌 곳에 있는 3자리 숫자
            
            const sessionMatch = sessionPattern1 || sessionPattern2 || sessionPattern3;
            session = sessionMatch ? sessionMatch[1].trim() : "";

            // 4) 결과(Result) 추출: 가결, 부결, 채택, 철회 등
            const resultMatch = tr.match(/(원안가결|수정가결|원안채택|수정채택|채택|부결|심사보고|철회|반려|본회의명)/);
            result = resultMatch ? resultMatch[0].trim() : "";

            // 5) 날짜(Date) 추출
            const dateMatch = tr.match(/20\d{2}[-\.]\d{1,2}[-\.]\d{1,2}/);
            dateRaw = dateMatch ? dateMatch[0] : "";

            // 6) 제목(Title) 결정: 의원명, 회기, 결과, 날짜를 제외한 나머지 중 가장 긴 것
            // 먼저 컬럼들 중에서 가장 제목 같은 것을 고름
            let potentialTitles = cols.filter((val, idx) => {
                const v = val.trim();
                if (idx === memberColIdx) return false;
                if (v === session || v === result || v === dateRaw) return false;
                if (v.length < 2) return false;
                return true;
            });

            if (potentialTitles.length > 0) {
                // '조례', '건의', '결의', '안'이 포함된 컬럼 우선
                const keywordTitles = potentialTitles.filter(v => v.includes("조례") || v.includes("안") || v.includes("법"));
                title = (keywordTitles.length > 0 ? keywordTitles : potentialTitles).reduce((a, b) => a.length > b.length ? a : b);
            } else {
                // 컬럼으로 안 나뉘면 tr 전체에서 불필요한 정보 제거
                title = tr.replace(memberName, "").replace(result, "").replace(dateRaw, "").replace(/제?\s*\d{1,4}\s*회/, "").trim();
            }

            // 제목 정제 (회기가 제목에 포함되어 있으면 제거)
            if (title && session) title = title.replace(session, "").replace("제회", "").trim();
            if (title) title = title.replace(/^[,\.\s\t]+|[,\.\s\t]+$/g, ""); // 앞뒤 특수문자 제거

            // 7) 최종 출력 텍스트 조합
            const datePart = formatDate(dateRaw);
            let entry = title;
            if (result) entry = `[${result}] ${entry}`;
            if (datePart) entry = `[${datePart}] ${entry}`;
            if (session) {
                const s = /^\d+$/.test(session) ? `제${session}회` : session;
                entry = `[${s}] ${entry}`;
            }
            
            // 중복 체크 및 최종 추가
            if (!bulkResults[matchedMember.name][categoryKey].includes(entry)) {
                bulkResults[matchedMember.name][categoryKey].push(entry);
            }
        });
    }

    // ------------------------------------------------------------------
    // 연구모임 (멀티라인) 전용 파싱
    // 상단 제목 / 구 성 원 / 활동기간 / 연구목적 순서의 블록 처리
    // ------------------------------------------------------------------
    function parseResearchBlocks(text, categoryKey) {
        if (!text || !text.trim()) return;
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        
        let currentBlock = { title: "", members: "", period: "", purpose: "" };
        let allBlocks = [];

        // 데이터 블록화
        lines.forEach(line => {
            const tr = line.trim();
            if (!tr) return;

            if (tr.startsWith("구 성 원")) currentBlock.members = tr;
            else if (tr.startsWith("활동기간")) currentBlock.period = tr;
            else if (tr.startsWith("연구목적")) {
                currentBlock.purpose = tr;
                allBlocks.push({...currentBlock});
                currentBlock = { title: "", members: "", period: "", purpose: "" };
            } else {
                // 이외의 줄은 제목으로 간주
                if (!currentBlock.title) currentBlock.title = tr;
                else currentBlock.title += " " + tr;
            }
        });

        // 각 블록을 의원에게 매칭
        allBlocks.forEach(block => {
            const title = block.title;
            const memberLine = block.members;
            const periodLine = block.period;
            
            // 날짜 추출 (활동기간 줄에서)
            const dateMatch = periodLine.match(/20\d{2}[-\.]\d{1,2}/);
            const datePart = dateMatch ? formatDate(dateMatch[0]) : "";

            for (const m of targetMembers) {
                // 대표의원명 포함 여부 확인
                if (memberLine.includes(m.name)) {
                    const entry = datePart ? `[${datePart}] ${title}` : title;
                    if (!bulkResults[m.name][categoryKey].includes(entry)) {
                        bulkResults[m.name][categoryKey].push(entry);
                    }
                }
            }
        });
    }

    // ------------------------------------------------------------------
    // 자유형식 텍스트 파싱 (기타 활동 등 - 보조용)
    // ------------------------------------------------------------------
    function parseFreeformData(text, categoryKey) {
        if (!text || !text.trim()) return;
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            // 날짜 추출
            const dateMatch = line.match(/20\d{2}[-\.]\d{1,2}[-\.]\d{1,2}/);
            const datePart  = dateMatch ? formatDate(dateMatch[0]) : '';

            // 제목 추출 (탭 구분시 가장 긴 비숫자/비날짜 컬럼)
            const cols = line.split('\t').map(c => c.trim()).filter(c => c);
            let titlePart = '';
            if (cols.length > 1) {
                titlePart = cols.reduce((best, p) => {
                    const isDateStr = /^\d{4}[-\.]\d{1,2}[-\.]\d{1,2}$/.test(p);
                    return (!isNaN(p) || isDateStr || p.length <= best.length) ? best : p;
                }, '');
            } else {
                // 단일 컬럼: 줄 자체를 제목으로 (날짜 부분 제거)
                titlePart = line.replace(/20\d{2}[-\.]\d{1,2}[-\.]\d{1,2}/, '').trim();
            }

            if (!titlePart) return;

            // 등록된 의원 이름이 이 줄에 포함되어 있는지 확인
            for (const m of targetMembers) {
                if (line.includes(m.name)) {
                    // 제목이 의원 이름만인 경우 건너뜀
                    if (titlePart === m.name) break;
                    const entry = datePart ? `[${datePart}] ${titlePart}` : titlePart;
                    
                    // 중복 체크 후 추가
                    if (!bulkResults[m.name][categoryKey].includes(entry)) {
                        bulkResults[m.name][categoryKey].push(entry);
                    }
                    break; // 첫 번째 매칭 의원에만 등록
                }
            }
        });
    }

    // ------------------------------------------------------------------
    // 상임위원회 (속기록 요약) 파싱: [META] / [SUMMARY] 텍스트 블록
    // forcedCategory: 'committee' or 'audit' (지정된 경우 해당 카테고리로 강제 분류)
    // ------------------------------------------------------------------
    function parseCommitteeData(text, forcedCategory = null) {
        if (!text || !text.trim()) return;
        const blocks = text.split('=== RECORD START ===');
        blocks.forEach(block => {
            if (!block.trim()) return;
            const metaMatch = block.match(/\[META\]([\s\S]*?)\[SUMMARY\]/);
            const summaryMatch = block.match(/\[SUMMARY\]([\s\S]*?)(\[ORIGINAL\]|=== RECORD END ===|$)/);
            if (!metaMatch || !summaryMatch) return;
            
            const metaText = (metaMatch[1] || "").trim();
            
            // 유연한 메타 필드 추출기
            function getField(keyword) {
                const regex = new RegExp(keyword + "\\s*[:：]\\s*(.*?)(?:\\r?\\n|$)", "i");
                const m = metaText.match(regex);
                return m ? m[1].trim() : "";
            }

            let memberName  = getField("의원명") || getField("성명") || getField("의원");
            let session     = getField("회기");
            let meetingName = getField("회의명");
            let dateRaw     = getField("일자") || getField("날짜");
            let summary     = summaryMatch[1].trim();

            if (!memberName) return;
            // "고광철 의원" -> "고광철"로 정규화
            memberName = memberName.replace(/\s*의원$/, "").trim();

            const matched = targetMembers.find(m => m.name === memberName);
            if (!matched) return;

            const datePart = formatDate(dateRaw.trim());
            const bodyContent = datePart ? `[${datePart}] ${summary}` : summary;
            
            const combinedText = (session + " " + meetingName).trim();
            let sessionClean = "";
            
            // 1. 연도 추출 (2022년, 2023년 등)
            let yearMatch = combinedText.match(/(20\d{2})\s*년/);
            let yearPart = yearMatch ? yearMatch[1] + "년" : "";
            
            // [보강] 회기/회의명에 연도가 없으면 날짜에서 연도를 가져옴
            if (!yearPart && datePart && datePart.startsWith("20")) {
                yearPart = datePart.substring(0, 4) + "년";
            }
            
            // 2. 회기 번호 추출 (제342회 등) - 단순 숫자(\d+) 대신 "제~회" 패턴을 찾아 정확도 향상
            const sessMatch = combinedText.match(/제\s*(\d+)\s*회/);
            const sessionNum = sessMatch ? sessMatch[1] : (combinedText.match(/\d+/) || [""])[0];
            
            let type = "";
            if (/정\s*례\s*회/.test(combinedText)) type = "(정례회)";
            else if (/임\s*시\s*회/.test(combinedText)) type = "(임시회)";
            
            if (sessionNum && sessionNum.length < 5) { // 연도(2024)를 회기로 잘못 잡는 것 방지 (회기는 보통 3~4자리 이하)
                sessionClean = `제${sessionNum}회${type}`;
            } else {
                sessionClean = type || "회의";
            }

            // 카테고리 결정: 강제 지정된 값이 있으면 사용, 없으면 키워드 기반 분류
            let cat = forcedCategory;
            const isAudit = combinedText.includes("행정사무감사");
            if (!cat) {
                cat = isAudit ? 'audit' : 'committee';
            }

            // 3. 최종 타이틀 조합 (행정감사의 경우 "2023년 행정사무감사" 형식 권장)
            let titlePart = "";
            if (cat === 'audit' || isAudit) {
                titlePart = yearPart ? `${yearPart} 행정사무감사` : "행정사무감사";
            } else {
                titlePart = sessionClean;
                if (!sessMatch && combinedText) {
                    titlePart = combinedText.length > 20 ? combinedText.substring(0, 20) + "..." : combinedText;
                }
            }

            const scList = bulkResults[matched.name][cat];
            let existingSlot = scList.find(sc => sc.title === titlePart);
            if (existingSlot) {
                // 중복 추가 방지
                if (!existingSlot.content.includes(summary)) {
                    existingSlot.content += (existingSlot.content ? '\n' : '') + bodyContent;
                }
            } else {
                scList.push({ title: titlePart, content: bodyContent });
            }
        });
    }

    // ------------------------------------------------------------------
    // 각 카테고리 파싱 실행
    // 5분발언: 번호(0) 회수(1) 제목(2) 발언의원(3) 회의일자(4)
    parseTabularData(categories['5min'],      '5min',       3, 2, 4);
    // 도정질문: 번호(0) 회수(1) 제목(2) 질문의원(3) 답변자(4) 회의일(5)
    parseTabularData(categories['question'],  'question',   3, 2, 5);
    // 대표발의조례: 번호(0) 회수(1) 제목(2) 의원(3) 날짜(4)
    parseTabularData(categories['bill'],      'bill',       3, 2, 4);
    // 건의안/결의안: 동일 구조
    parseTabularData(categories['suggestion'],'suggestion', 3, 2, 4);
    
    // 의정토론회: 자유형식(리스트) 처리
    parseFreeformData(categories['debate'], 'debate');

    // 연구모임: 멀티라인 블록 형식 처리
    parseResearchBlocks(categories['research'], 'research');
    
    // 상임위원회 속기록 요약 (각각 전용 카테고리로 강제 분류)
    parseCommitteeData(categories['committee'], 'committee');
    // 행정사무감사 속기록 요약
    parseCommitteeData(categories['audit'],     'audit');
    // ------------------------------------------------------------------

    // 최대 상임위/행감 활동 개수 계산
    let maxSComs = 5;
    let maxAudits = 5;
    targetMembers.forEach(m => {
        const cCount = bulkResults[m.name]['committee'].length;
        const aCount = bulkResults[m.name]['audit'].length;
        if (cCount > maxSComs) maxSComs = cCount;
        if (aCount > maxAudits) maxAudits = aCount;
    });

    const headers = getExcelHeaders(maxSComs, maxAudits);
    const ws_data = [headers];

    targetMembers.forEach(m => {
        let row = [
            m.name || "", m.constituency || "", m.party || "", m.gender || "", m.birthDate || "", m.address || "", m.education || "", m.career || "", m.region || "",
            m.committee1 || "", m.committee2 || "",
            bulkResults[m.name]['5min'].join('\n'), 
            bulkResults[m.name]['question'].join('\n'),
            bulkResults[m.name]['bill'].join('\n'),
            bulkResults[m.name]['suggestion'].join('\n'),
            bulkResults[m.name]['debate'].join('\n'),
            bulkResults[m.name]['research'].join('\n')
        ];

        // 상임위 활동 데이터 동적 추가 및 최신순 정렬
        const sComs = sortStandingComs(bulkResults[m.name]['committee']);
        for (let i = 0; i < maxSComs; i++) {
            row.push(sComs[i] ? sComs[i].title : "");
            row.push(sComs[i] ? sComs[i].content : "");
        }
        
        // 행정사무감사 데이터 동적 추가 및 최신순 정렬
        const aComs = sortStandingComs(bulkResults[m.name]['audit']);
        for (let i = 0; i < maxAudits; i++) {
            row.push(aComs[i] ? aComs[i].title : "");
            row.push(aComs[i] ? aComs[i].content : "");
        }

        ws_data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = headers.map(() => ({wch: 15}));
    ws['!cols'][11] = {wch: 40}; ws['!cols'][12] = {wch: 40}; ws['!cols'][13] = {wch: 40};
    ws['!cols'][14] = {wch: 40}; ws['!cols'][15] = {wch: 40}; 

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "의원데이터");
    XLSX.writeFile(wb, "의정활동_최종일괄업데이트.xlsx");

    document.getElementById('bulkGeneratorModal').classList.remove('active');
    alert("취합 완료! \n'의정활동_최종일괄업데이트.xlsx' 파일이 다운로드되었습니다.\n(해당 파일을 파일 업로드 기능을 통해 올리면 화면에 일괄 적용됩니다!)");
}

function enableAdminMode() {
    isAdmin = true;
    sessionStorage.setItem('isAdmin', 'true');
    document.body.classList.remove('user-mode');
    
    const btn = document.getElementById('adminToggleBtn');
    btn.textContent = '🔓 관리자 종료';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    
    toggleEditability(true);
}

function disableAdminMode() {
    isAdmin = false;
    sessionStorage.setItem('isAdmin', 'false');
    document.body.classList.add('user-mode');
    
    const btn = document.getElementById('adminToggleBtn');
    btn.textContent = '⚙️ 관리자 로그인';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    
    toggleEditability(false);
}

function toggleEditability(canEdit) {
    // 편집 가능해야할 요소들을 찾아 모두 전환합니다.
    const targets = document.querySelectorAll('.editable-content, .rich-content, td[id^="td-"], .card-title, .activity-type, .session-title-edit');
    targets.forEach(el => {
        if(canEdit) el.setAttribute('contenteditable', 'true');
        else el.removeAttribute('contenteditable');
    });
}

// ----------------------------------------------------------------------------------
// Excel Parse / UI Build
// ----------------------------------------------------------------------------------
// (The Excel parsing, templating, and rendering list code below is preserved and adapted to adhere to toggleEditability)

function getExcelHeaders(maxSComs = 5, maxAudits = 5) {
    const baseHeaders = [
        "성명", "선거구명", "소속정당", "성별", "생년월일", "주소", "학력", "주요경력", "지역구",
        "13대전반기상임위", "13대후반기상임위",
        "5분발언", "도정질문", "조례안 대표발의", "건의안 및 결의안", "의정토론회", "연구모임"
    ];
    for (let i = 1; i <= maxSComs; i++) {
        baseHeaders.push(`상임위활동${i}_구분`, `상임위활동${i}_내역`);
    }
    for (let i = 1; i <= maxAudits; i++) {
        baseHeaders.push(`행정사무감사${i}_구분`, `행정사무감사${i}_내역`);
    }
    return baseHeaders;
}

function downloadExcelTemplate() {
    const headers = getExcelHeaders(5, 5); // 템플릿은 기본 5개씩 생성
    const emptyRow = headers.map(() => "");
    // 기본 안내 데이터 채우기
    const sampleRow = ["의원이름", "선거구", "당", "남/여", "19XX", "주소", "학력", "경력", "지역", "전상임위", "후상임위", "다중줄바꿈(Alt+Enter)", "...", "...", "...", "...", "제350회 임시회", "- 요약...", "", "", "","","","","","","제356회 정례회", "-(행정감사요약)"];
    while(sampleRow.length < headers.length) sampleRow.push("");

    const ws_data = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = headers.map(() => ({wch: 15}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "의원데이터");
    XLSX.writeFile(wb, "의정활동_데이터_템플릿.xlsx");
}

function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 기존 데이터가 있을 때만 선택지 제공
    const hasPrevData = activeMembers && activeMembers.length > 0;
    let mergeMode = false;
    if (hasPrevData) {
        const choice = confirm(
            "📂 업로드 방식을 선택하세요.\n\n" +
            "[ 확인 ]  → 기존 데이터에 추가/병합\n" +
            "         (같은 이름 의원은 활동내역이 이어붙여지고,\n" +
            "          새 의원은 목록에 추가됩니다.)\n\n" +
            "[ 취소 ]  → 기존 데이터를 완전히 대체"
        );
        mergeMode = choice; // true=병합, false=대체
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const data = evt.target.result;
        const workbook = XLSX.read(data, {type: 'binary'});
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval: ""});
        if (rows.length === 0) return alert("데이터가 비어있습니다.");

        const newMembers = rows.map(row => {
            const member = {
                id: row["성명"], name: row["성명"], constituency: row["선거구명"], party: row["소속정당"],
                gender: row["성별"], birthDate: row["생년월일"], address: row["주소"], education: row["학력"],
                career: row["주요경력"], region: row["지역구"],
                committee1: row["13대전반기상임위"] || row["전반기상임위"],
                committee2: row["13대후반기상임위"] || row["후반기상임위"],
                activities_5min:       row["5분발언"],
                activities_question:   row["도정질문"],
                activities_bill:       row["조례안 대표발의"] || row["대표발의조례"],
                activities_suggestion: row["건의안 및 결의안"] || row["건의안"],
                activities_debate:     row["의정토론회"] || "",
                activities_research:   row["연구모임"] || row["의정토론회연구모임"] || row["의정토론회"],
                standing_coms: [],
                audit_coms: []
            };

            // "상임위활동N_구분" 패턴의 모든 데이터 추출
            let idx = 1;
            while (row[`상임위활동${idx}_구분`] !== undefined || row[`상임위활동${idx}_내역`] !== undefined) {
                const title = row[`상임위활동${idx}_구분`] || "";
                const content = row[`상임위활동${idx}_내역`] || "";
                if (title || content) {
                    member.standing_coms.push({ title, content });
                }
                idx++;
            }

            // "행정사무감사N_구분" 패턴의 모든 데이터 추출
            let aidx = 1;
            while (row[`행정사무감사${aidx}_구분`] !== undefined || row[`행정사무감사${aidx}_내역`] !== undefined) {
                const title = row[`행정사무감사${aidx}_구분`] || "";
                const content = row[`행정사무감사${aidx}_내역`] || "";
                if (title || content) {
                    member.audit_coms.push({ title, content });
                }
                aidx++;
            }
            return member;
        });

        if (!mergeMode) {
            // ── 대체 모드: 기존 데이터 완전 교체
            activeMembers = newMembers;
            saveToLocalStorage();
            renderDropdown();
            alert(`✅ 전체 대체 완료. (${activeMembers.length}명)`);
        } else {
            // ── 병합 모드
            // 활동내역 텍스트 이어붙이기 헬퍼 (중복 줄 제거 후 합산)
            function mergeText(oldText, newText) {
                const oldLines = (oldText || '').split('\n').map(l => l.trim()).filter(l => l);
                const newLines = (newText || '').split('\n').map(l => l.trim()).filter(l => l);
                // 새 항목 중 기존에 없는 것만 추가
                const toAdd = newLines.filter(nl => !oldLines.includes(nl));
                return [...oldLines, ...toAdd].join('\n');
            }

            let addedCount = 0;
            let mergedCount = 0;

            newMembers.forEach(nm => {
                if (!nm.name) return;
                const existing = activeMembers.find(m => m.name === nm.name);
                if (existing) {
                    // 같은 의원 → 활동내역 병합 (신상정보는 새 파일 값으로 덮어쓰되 빈 칸이면 기존 유지)
                    existing.constituency   = nm.constituency   || existing.constituency;
                    existing.party          = nm.party          || existing.party;
                    existing.gender         = nm.gender         || existing.gender;
                    existing.birthDate      = nm.birthDate      || existing.birthDate;
                    existing.address        = nm.address        || existing.address;
                    existing.education      = nm.education      || existing.education;
                    existing.career         = nm.career         || existing.career;
                    existing.region         = nm.region         || existing.region;
                    existing.committee1     = nm.committee1     || existing.committee1;
                    existing.committee2     = nm.committee2     || existing.committee2;

                    // 활동내역: 중복 제거하며 이어붙이기
                    existing.activities_5min       = mergeText(existing.activities_5min,       nm.activities_5min);
                    existing.activities_question   = mergeText(existing.activities_question,   nm.activities_question);
                    existing.activities_bill       = mergeText(existing.activities_bill,       nm.activities_bill);
                    existing.activities_suggestion = mergeText(existing.activities_suggestion, nm.activities_suggestion);
                    existing.activities_research   = mergeText(existing.activities_research,   nm.activities_research);

                    // 상임위 활동: 새 파일에 내용이 있는 슬롯만 덮어씀
                    nm.standing_coms.forEach((sc, i) => {
                        if (sc.title || sc.content) {
                            existing.standing_coms[i] = sc;
                        }
                    });

                    // 행정사무감사 활동 병합
                    nm.audit_coms.forEach((ac, i) => {
                        if (ac.title || ac.content) {
                            if(!existing.audit_coms) existing.audit_coms = [];
                            existing.audit_coms[i] = ac;
                        }
                    });
                    mergedCount++;
                } else {
                    // 새 의원 → 추가
                    activeMembers.push(nm);
                    addedCount++;
                }
            });

            saveToLocalStorage();
            renderDropdown();
            alert(`✅ 병합 완료!\n- 기존 의원 업데이트: ${mergedCount}명\n- 신규 의원 추가: ${addedCount}명\n(총 ${activeMembers.length}명)`);
        }

        // 파일 input 초기화 (같은 파일 재업로드 가능하도록)
        e.target.value = '';
    };
    reader.readAsBinaryString(file);
}

// ----------------------------------------------------------------------------------
// 속기록 TXT 파일 직접 업로드 (=== RECORD START === 형식)
// ----------------------------------------------------------------------------------
function handleTxtUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const promises = files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
    }));

    Promise.all(promises).then(contents => {
        const fullText = contents.join('\n');
        let addedCommittee = 0;
        let addedAudit = 0;
        const unmatched = new Set();

        const blocks = fullText.split('=== RECORD START ===');
        blocks.forEach(block => {
            if (!block.trim()) return;

            const metaMatch = block.match(/\[META\]([\s\S]*?)\[SUMMARY\]/);
            const summaryMatch = block.match(/\[SUMMARY\]([\s\S]*?)(\[ORIGINAL\]|=== RECORD END ===|$)/);
            if (!metaMatch || !summaryMatch) return;

            const metaText = (metaMatch[1] || '').trim();

            function getField(keyword) {
                const regex = new RegExp(keyword + '\\s*[:：]\\s*(.*?)(?:\\r?\\n|$)', 'i');
                const m = metaText.match(regex);
                return m ? m[1].trim() : '';
            }

            let memberName = getField('의원명') || getField('성명') || getField('의원');
            const session     = getField('회기');
            const meetingName = getField('회의명');
            const dateRaw     = getField('일자') || getField('날짜');
            const summary     = summaryMatch[1].trim();

            if (!memberName) return;
            memberName = memberName.replace(/\s*의원$/, '').trim();

            const matched = activeMembers.find(m => m.name === memberName);
            if (!matched) { unmatched.add(memberName); return; }

            const datePart   = formatDate(dateRaw.trim());
            const bodyContent = datePart ? `[${datePart}] ${summary}` : summary;
            const combinedText = (session + ' ' + meetingName).trim();

            // 연도 추출
            const yearMatch = combinedText.match(/(20\d{2})\s*년/);
            let yearPart = yearMatch ? yearMatch[1] + '년' : '';
            if (!yearPart && datePart && datePart.startsWith('20')) yearPart = datePart.substring(0, 4) + '년';

            // 회기 번호 추출
            const sessMatch  = combinedText.match(/제\s*(\d+)\s*회/);
            const sessionNum = sessMatch ? sessMatch[1] : (combinedText.match(/\d+/) || [''])[0];
            let type = '';
            if (/정\s*례\s*회/.test(combinedText)) type = '(정례회)';
            else if (/임\s*시\s*회/.test(combinedText)) type = '(임시회)';

            let sessionClean = '';
            if (sessionNum && sessionNum.length < 5) sessionClean = `제${sessionNum}회${type}`;
            else sessionClean = type || '회의';

            const isAudit = combinedText.includes('행정사무감사');
            let titlePart = '';
            if (isAudit) {
                titlePart = yearPart ? `${yearPart} 행정사무감사` : '행정사무감사';
            } else {
                titlePart = sessionClean;
                if (!sessMatch && combinedText) titlePart = combinedText.length > 20 ? combinedText.substring(0, 20) + '...' : combinedText;
            }

            if (isAudit) {
                if (!matched.audit_coms) matched.audit_coms = [];
                const slot = matched.audit_coms.find(ac => ac.title === titlePart);
                if (slot) {
                    if (!slot.content.includes(summary)) slot.content += (slot.content ? '\n' : '') + bodyContent;
                } else {
                    matched.audit_coms.push({ title: titlePart, content: bodyContent });
                    addedAudit++;
                }
            } else {
                if (!matched.standing_coms) matched.standing_coms = [];
                const slot = matched.standing_coms.find(sc => sc.title === titlePart);
                if (slot) {
                    if (!slot.content.includes(summary)) slot.content += (slot.content ? '\n' : '') + bodyContent;
                } else {
                    matched.standing_coms.push({ title: titlePart, content: bodyContent });
                    addedCommittee++;
                }
            }
        });

        saveToLocalStorage();

        // 현재 열려있는 의원 카드 갱신
        const currentId = document.getElementById('memberSelect').value;
        if (currentId) applyMemberData(currentId);

        let msg = `✅ TXT 업로드 완료! (${files.length}개 파일)\n- 상임위 활동: ${addedCommittee}건 추가\n- 행정감사 활동: ${addedAudit}건 추가`;
        if (unmatched.size > 0) msg += `\n\n⚠️ 의원 명단에 없어 매칭 실패:\n${[...unmatched].join(', ')}`;
        alert(msg);
    }).catch(() => alert('파일을 읽는 중 오류가 발생했습니다.'));

    e.target.value = '';
}

function renderDropdown() {
    const select = document.getElementById('memberSelect');
    select.innerHTML = '<option value="">명단을 선택하세요</option>';
    activeMembers.forEach(member => {
        if(!member.id) return;
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = `[${member.constituency}] ${member.name} 의원`;
        select.appendChild(option);
    });
}

// 이미지 압축: maxW×maxH 이내로 축소 후 JPEG quality로 인코딩, 결과를 callback(base64)으로 전달
function compressPhoto(dataUrl, maxW, maxH, quality, callback) {
    const image = new window.Image();
    image.onload = function() {
        let w = image.width;
        let h = image.height;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(image, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = function() {
        callback(dataUrl); // 압축 실패 시 원본 사용
    };
    image.src = dataUrl;
}

function showMemberPhoto(src) {
    const img = document.getElementById('memberPhoto');
    const placeholder = document.getElementById('memberPhotoPlaceholder');
    const deleteBtn = document.getElementById('memberPhotoDeleteBtn');
    if (src) {
        img.src = src;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        deleteBtn.style.display = 'inline-block';
    } else {
        img.src = '';
        img.style.display = 'none';
        placeholder.style.display = 'block';
        deleteBtn.style.display = 'none';
    }
}

function applyMemberData(id) {
    const plenaryContainer = document.getElementById('plenaryActivities');
    const billContainer = document.getElementById('billActivities');
    const debateContainer = document.getElementById('debateActivities');
    const researchContainer = document.getElementById('researchActivities');
    const committeeContainer = document.getElementById('committeeActivities');
    const auditContainer = document.getElementById('auditActivities');

    const fields = ['constituency', 'name', 'party', 'gender', 'birthDate', 'address', 'education', 'career', 'region', 'committee1', 'committee2'];
    fields.forEach(f => { document.getElementById(`td-${f}`).innerHTML = ''; });
    plenaryContainer.innerHTML = '';
    billContainer.innerHTML = '';
    debateContainer.innerHTML = '';
    researchContainer.innerHTML = '';
    committeeContainer.innerHTML = '';
    auditContainer.innerHTML = '';

    const member = activeMembers.find(m => m.id === id);
    if (!member) return;

    // 사진 로드 (member.photo 우선, 구버전 호환으로 localStorage 폴백)
    const savedPhoto = member.photo || localStorage.getItem(`memberPhoto_${id}`) || null;
    if (!member.photo && savedPhoto) {
        member.photo = savedPhoto;
        localStorage.removeItem(`memberPhoto_${id}`);
        saveToLocalStorage();
    }
    showMemberPhoto(savedPhoto);

    // Fill Basic Text
    fields.forEach(f => { 
        if(document.getElementById(`td-${f}`)) {
            let val = member[f] || '';
            if(f==='committee2') val = val.replace(/\n/g, '<br>');
            document.getElementById(`td-${f}`).innerHTML = val;
        }
    });

    // Fill Plenary Lists (1-3 items: 5분발언, 도정질문, 건의안)
    const ptTypes = [
        { title: "5분 발언", data: (member.activities_5min !== undefined ? member.activities_5min : member.plenary_5min) || "" },
        { title: "도정질문", data: (member.activities_question !== undefined ? member.activities_question : member.plenary_question) || "" },
        { title: "건의안 및 결의안", data: (member.activities_suggestion !== undefined ? member.activities_suggestion : member.plenary_suggestion) || "" }
    ];

    ptTypes.forEach(pt => {
        const lines = pt.data.split('\n').filter(line => line.trim() !== '');
        let listHtml = lines.map(line => `
            <li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}>${line}</div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>
        `).join('');

        plenaryContainer.innerHTML += `
            <div class="activity-section">
                <div class="section-actions no-print"><button class="action-btn delete-btn admin-only" onclick="this.closest('.activity-section').remove()">✕ 삭제</button></div>
                <h3 class="activity-type" ${isAdmin ? 'contenteditable="true"' : ''}>${pt.title}</h3>

                <ul class="activity-list">${listHtml}</ul>
                <button class="action-btn add-li-btn admin-only no-print" onclick="addListItem(this.previousElementSibling)">+ 내역 추가</button>
            </div>
        `;
    });

    // Fill Bill Lists (Independent Section)
    const billValue = (member.activities_bill !== undefined ? member.activities_bill : member.plenary_bill) || "";
    const billLines = billValue.split('\n').filter(line => line.trim() !== '');
    let billListHtml = billLines.map(line => `
        <li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}>${line}</div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>
    `).join('');

    billContainer.innerHTML = `
        <div class="section-title-wrap" style="margin-top: 30px;">
            <h2 class="section-title">&lt;조례안 대표발의&gt;</h2>
        </div>
        <div class="activity-section" style="border:none; padding:0; margin:0;">
            <div class="section-actions no-print" style="display:none;"><button class="action-btn delete-btn admin-only" onclick="this.closest('.activity-section').remove()">✕ 삭제</button></div>
            <h3 class="activity-type" ${isAdmin ? 'contenteditable="true"' : ''} style="display:none;">대표발의 조례</h3>
            <ul class="activity-list">${billListHtml}</ul>
            <button class="action-btn add-li-btn admin-only no-print" onclick="addListItem(this.previousElementSibling)">+ 내역 추가</button>
        </div>
    `;

    // Fill Debate Lists (Independent Section)
    const debValue = (member.activities_debate !== undefined ? member.activities_debate : "") || "";
    const debLines = debValue.split('\n').filter(line => line.trim() !== '');
    let debListHtml = debLines.map(line => `
        <li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}>${line}</div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>
    `).join('');
    if (!debListHtml) debListHtml = `<li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}></div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>`;

    debateContainer.innerHTML = `
        <div class="section-title-wrap" style="margin-top: 30px;">
            <h2 class="section-title">&lt;의정토론회&gt;</h2>
        </div>
        <div class="activity-section" style="border:none; padding:0; margin:0;">
            <div class="section-actions no-print" style="display:none;"><button class="action-btn delete-btn admin-only" onclick="this.closest('.activity-section').remove()">✕ 삭제</button></div>
            <h3 class="activity-type" ${isAdmin ? 'contenteditable="true"' : ''} style="display:none;">의정토론회</h3>
            <ul class="activity-list">${debListHtml}</ul>
            <button class="action-btn add-li-btn admin-only no-print" onclick="addListItem(this.previousElementSibling)">+ 내역 추가</button>
        </div>
    `;

    // Fill Research Lists (Independent Section)
    const resValue = (member.activities_research !== undefined ? member.activities_research : "") || "";
    const resLines = resValue.split('\n').filter(line => line.trim() !== '');
    let resListHtml = resLines.map(line => `
        <li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}>${line}</div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>
    `).join('');
    if (!resListHtml) resListHtml = `<li><div class="editable-content" ${isAdmin ? 'contenteditable="true"' : ''}></div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>`;

    researchContainer.innerHTML = `
        <div class="section-title-wrap" style="margin-top: 30px;">
            <h2 class="section-title">&lt;연구모임&gt;</h2>
        </div>
        <div class="activity-section" style="border:none; padding:0; margin:0;">
            <div class="section-actions no-print" style="display:none;"><button class="action-btn delete-btn admin-only" onclick="this.closest('.activity-section').remove()">✕ 삭제</button></div>
            <h3 class="activity-type" ${isAdmin ? 'contenteditable="true"' : ''} style="display:none;">연구모임</h3>
            <ul class="activity-list">${resListHtml}</ul>
            <button class="action-btn add-li-btn admin-only no-print" onclick="addListItem(this.previousElementSibling)">+ 내역 추가</button>
        </div>
    `;

    // Fill Committee Lists (Sort by session count descending)
    const scoms = sortStandingComs(member.standing_coms || []);
    scoms.forEach(sc => {
        if (!sc.title && !sc.content) return;
        committeeContainer.innerHTML += `
            <tr>
                <td class="session-name relative">
                    <div class="session-title-edit font-semibold">${(sc.title||'').replace(/\n/g, '<br>')}</div>
                    <button class="action-btn delete-btn row-delete-btn admin-only no-print mt-2" onclick="this.closest('tr').remove()">✕ 삭제</button>
                </td>
                <td class="session-details relative">
                    <div class="rich-content">${sc.content||''}</div>
                </td>
            </tr>
        `;
    });

    // Fill Audit Lists (Sort by session count descending)
    const acoms = sortStandingComs(member.audit_coms || []);
    acoms.forEach(ac => {
        if (!ac.title && !ac.content) return;
        auditContainer.innerHTML += `
            <tr>
                <td class="session-name relative">
                    <div class="session-title-edit font-semibold">${(ac.title||'').replace(/\n/g, '<br>')}</div>
                    <button class="action-btn delete-btn row-delete-btn admin-only no-print mt-2" onclick="this.closest('tr').remove()">✕ 삭제</button>
                </td>
                <td class="session-details relative">
                    <div class="rich-content">${ac.content||''}</div>
                </td>
            </tr>
        `;
    });

    toggleEditability(isAdmin); // Revert all freshly minted blocks to their correct state
}

function addPlenarySection() {
    const container = document.getElementById('plenaryActivities');
    const section = document.createElement('div');
    section.className = 'activity-section';
    section.innerHTML = `
        <div class="section-actions no-print"><button class="action-btn delete-btn admin-only" onclick="this.closest('.activity-section').remove()">✕ 삭제</button></div>
        <h3 class="activity-type" contenteditable="true">새 활동 유형</h3>

        <ul class="activity-list">
            <li><div class="editable-content" contenteditable="true">내역 입력</div><button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button></li>
        </ul>
        <button class="action-btn add-li-btn admin-only no-print" onclick="addListItem(this.previousElementSibling)">+ 내역 추가</button>
    `;
    container.appendChild(section);
}

function addListItem(ulElement) {
    const li = document.createElement('li');
    li.innerHTML = `
        <div class="editable-content" contenteditable="true">내역 입력</div>
        <button class="action-btn delete-li-btn admin-only no-print" onclick="this.parentElement.remove()">✕</button>
    `;
    ulElement.appendChild(li);
    li.querySelector('.editable-content').focus();
}

function addCommitteeActivity() {
    const tbody = document.getElementById('committeeActivities');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="session-name relative">
            <div contenteditable="true" class="session-title-edit font-semibold text-center">제 OOO회</div>
            <button class="action-btn delete-btn row-delete-btn admin-only no-print mt-2" onclick="this.closest('tr').remove()">✕ 행 삭제</button>
        </td>
        <td class="session-details relative">
            <div class="rich-content" contenteditable="true">- 세부 활동 내역 입력</div>
        </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.session-title-edit').focus();
}

function addAuditActivity() {
    const tbody = document.getElementById('auditActivities');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="session-name relative">
            <div contenteditable="true" class="session-title-edit font-semibold text-center">제 OOO회(행정감사)</div>
            <button class="action-btn delete-btn row-delete-btn admin-only no-print mt-2" onclick="this.closest('tr').remove()">✕ 행 삭제</button>
        </td>
        <td class="session-details relative">
            <div class="rich-content" contenteditable="true">- 행정사무감사 세부 내역 입력</div>
        </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.session-title-edit').focus();
}

// ----------------------------------------------------------------------------------
// 신규 의원 수동 추가
// ----------------------------------------------------------------------------------
function addNewMemberFromModal() {
    const name = (document.getElementById('newM_name').value || '').trim();
    if (!name) {
        alert('성명은 필수 입력입니다.');
        document.getElementById('newM_name').focus();
        return;
    }

    // 중복 검사
    if (activeMembers.find(m => m.name === name)) {
        alert(`'${name}' 의원은 이미 목록에 있습니다.`);
        return;
    }

    const newMember = {
        id:           name,
        name:         name,
        constituency: (document.getElementById('newM_constituency').value || '').trim(),
        party:        (document.getElementById('newM_party').value || '').trim(),
        gender:       (document.getElementById('newM_gender').value || '').trim(),
        birthDate:    (document.getElementById('newM_birthDate').value || '').trim(),
        address:      (document.getElementById('newM_address').value || '').trim(),
        education:    (document.getElementById('newM_education').value || '').trim(),
        career:       (document.getElementById('newM_career').value || '').trim(),
        region:       (document.getElementById('newM_region').value || '').trim(),
        committee1:   (document.getElementById('newM_committee1').value || '').trim(),
        committee2:   (document.getElementById('newM_committee2').value || '').trim(),
        activities_5min:       '',
        activities_question:   '',
        activities_bill:       '',
        activities_suggestion: '',
        activities_research:   '',
        standing_coms: [],
        audit_coms: []
    };

    activeMembers.push(newMember);
    saveToLocalStorage();
    renderDropdown();

    // 추가된 의원 바로 선택
    document.getElementById('memberSelect').value = name;
    applyMemberData(name);

    document.getElementById('addMemberModal').classList.remove('active');
    alert(`✅ '${name}' 의원이 추가되었습니다.\n신상정보는 카드에서 직접 편집하거나 엑셀 업로드로 보완할 수 있습니다.`);
}

// ----------------------------------------------------------------------------------
// 현재 선택된 의원 삭제
// ----------------------------------------------------------------------------------
function deleteCurrentMember() {
    const select = document.getElementById('memberSelect');
    const selectedId = select.value;

    if (!selectedId) {
        alert('삭제할 의원을 먼저 선택하세요.');
        return;
    }

    const member = activeMembers.find(m => m.id === selectedId);
    if (!member) return;

    if (!confirm(`⚠️ '${member.name}' 의원을 목록에서 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    // 목록에서 제거
    activeMembers = activeMembers.filter(m => m.id !== selectedId);
    saveToLocalStorage();
    renderDropdown();

    // 카드 초기화
    const fields = ['constituency','name','party','gender','birthDate','address','education','career','region','committee1','committee2'];
    fields.forEach(f => { const el = document.getElementById(`td-${f}`); if(el) el.innerHTML = ''; });
    document.getElementById('plenaryActivities').innerHTML = '';
    document.getElementById('committeeActivities').innerHTML = '';

    alert(`🗑️ '${member.name}' 의원이 삭제되었습니다.`);
}

// ----------------------------------------------------------------------------------
// 현재 카드 내용 저장 (관리자 직접 편집 내용)
// ----------------------------------------------------------------------------------
function saveCurrentEdits() {
    if (!isAdmin) return;
    
    const select = document.getElementById('memberSelect');
    const selectedId = select.value;

    if (!selectedId) {
        alert('저장할 대상 의원이 선택되지 않았습니다.');
        return;
    }

    const member = activeMembers.find(m => m.id === selectedId);
    if (!member) return;

    // 1. 신상정보 저장
    const fields = ['constituency','name','party','gender','birthDate','address','education','career','region','committee1','committee2'];
    fields.forEach(f => {
        const el = document.getElementById(`td-${f}`);
        if(el) member[f] = el.innerText.trim();
    });

    // 2. 본회의 활동 및 토론회, 연구모임 저장
    member.activities_5min = ''; member.activities_question = '';
    member.activities_bill = ''; member.activities_suggestion = '';
    member.activities_debate = ''; member.activities_research = '';

    const plenarySections = document.querySelectorAll('#plenaryActivities .activity-section, #billActivities .activity-section, #debateActivities .activity-section, #researchActivities .activity-section');
    plenarySections.forEach(section => {
        const typeEl = section.querySelector('.activity-type');
        if (!typeEl) return;
        const typeText = typeEl.innerText.trim();
        
        const listItems = section.querySelectorAll('.activity-list li .editable-content');
        const joinedText = Array.from(listItems).map(el => el.innerText.trim()).filter(t => t !== '').join('\n');

        if (typeText.includes('5분')) member.activities_5min = joinedText;
        else if (typeText.includes('도정')) member.activities_question = joinedText;
        else if (typeText.includes('조례')) member.activities_bill = joinedText;
        else if (typeText.includes('건의') || typeText.includes('결의')) member.activities_suggestion = joinedText;
        else if (typeText.includes('토론회')) member.activities_debate = joinedText;
        else if (typeText.includes('연구모임')) member.activities_research = joinedText;
    });

    const committeeRows = document.querySelectorAll('#committeeActivities tr');
    member.standing_coms = [];
    committeeRows.forEach((tr) => {
        const titleEl = tr.querySelector('.session-title-edit');
        const contentEl = tr.querySelector('.rich-content');
        const title = titleEl ? titleEl.innerText.trim() : '';
        const content = contentEl ? contentEl.innerText.trim() : '';
        if (title || content) {
            member.standing_coms.push({ title, content });
        }
    });

    member.standing_coms = sortStandingComs(member.standing_coms);

    // 4. 행정사무감사 활동 저장
    const auditRows = document.querySelectorAll('#auditActivities tr');
    member.audit_coms = [];
    auditRows.forEach((tr) => {
        const titleEl = tr.querySelector('.session-title-edit');
        const contentEl = tr.querySelector('.rich-content');
        const title = titleEl ? titleEl.innerText.trim() : '';
        const content = contentEl ? contentEl.innerText.trim() : '';
        if (title || content) {
            member.audit_coms.push({ title, content });
        }
    });
    member.audit_coms = sortStandingComs(member.audit_coms);

    // 로컬스토리지에 전체 내역 저장
    saveToLocalStorage();
    alert(`💾 '${member.name}' 의원의 변경사항이 성공적으로 저장되었습니다.\n(현재 브라우저 내에 유지되며, '데이터 양식 다운로드' 시 반영됩니다)`);
}

/**
 * 현재 모든 의원 데이터를 membersData.js 형식으로 추출 (배포용)
 */
function exportToMembersDataJs() {
    if (!confirm('현재 화면의 모든 의원 데이터를 membersData.js 파일로 추출하시겠습니까?\n이 파일을 깃허브의 기존 파일과 교환하면 모든 사용자에게 동일한 데이터가 보입니다.')) return;
    
    // membersData 변수 선언문 형식으로 직렬화 (버전 상수 포함)
    const version = new Date().toISOString().slice(0, 19).replace('T', '_');
    const content = `// ※ GitHub 배포 후 membersData.js가 반영되지 않을 경우, 아래 버전 값을 변경하세요.\n//   localStorage 캐시가 자동으로 무효화되고 이 파일의 데이터가 우선 적용됩니다.\nconst MEMBERS_DATA_VERSION = "${version}";\n\nconst membersData = ${JSON.stringify(activeMembers, null, 4)};`;
    
    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'membersData.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('membersData.js 파일이 다운로드되었습니다.\n이 파일을 깃허브 저장소에 업로드하시면 동기화가 완료됩니다.');
}
