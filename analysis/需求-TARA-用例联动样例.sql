BEGIN;

INSERT OR IGNORE INTO requirements (requirement_key, title, category, priority, status, owner, description)
VALUES
('REQ-AC-001', '禁止未授权 SSH 远程登录', '访问控制', 'P0', 'OPEN', '安全测试组', '仅允许授权账号与来源访问 SSH，未授权登录必须拒绝。'),
('REQ-ADB-001', '禁止未授权 ADB 调试会话', '访问控制', 'P0', 'OPEN', '安全测试组', '默认生产配置下应拒绝 adb connect/adb shell 未授权访问。'),
('REQ-NET-001', '禁用高风险明文服务 Telnet/FTP', '网络暴露', 'P0', 'OPEN', '安全测试组', '生产环境不应暴露明文远程管理与文件传输服务。'),
('REQ-AUTH-001', 'root 远程登录禁用与口令策略强制', '身份认证', 'P0', 'OPEN', '安全测试组', '禁止 root 远程登录，且应拒绝空口令和弱口令认证。'),
('REQ-LOG-001', '关键系统日志需防篡改与可审计', '日志安全', 'P1', 'OPEN', '安全测试组', '系统与内核日志应可留存、可审计、不可被未授权篡改。');

INSERT OR IGNORE INTO tara_items (threat_key, title, risk_level, status, attack_vector, impact, likelihood, mitigation, description)
VALUES
('TARA-AC-001', 'SSH 未授权访问导致控制面暴露', 'HIGH', 'OPEN', 'Ethernet/SSH', '可远程执行敏感命令，影响系统完整性', 'MEDIUM', '限制来源+账号策略+最小权限', '攻击者通过网络尝试未授权 SSH 登录。'),
('TARA-ADB-001', 'ADB over TCP 暴露导致系统接管', 'CRITICAL', 'OPEN', 'Ethernet/ADB', '可能直接获取 shell 权限并执行系统级操作', 'MEDIUM', '关闭生产设备 ADB TCP 调试端口', '设备暴露 adb 服务且未启用访问控制。'),
('TARA-NET-001', 'Telnet/FTP 明文服务暴露导致凭据泄露', 'HIGH', 'OPEN', 'Ethernet/Telnet/FTP', '凭据泄露后可被横向利用', 'HIGH', '禁用明文服务，仅保留受控安全通道', '弱安全远程服务对外可达。'),
('TARA-AUTH-001', 'root 远程登录与弱口令导致提权', 'HIGH', 'OPEN', 'SSH', '高权限账号被远程滥用', 'MEDIUM', '禁用 root 直登+强口令策略+锁定机制', '认证策略薄弱导致高权限账号风险。'),
('TARA-LOG-001', '日志被清理或篡改导致取证失效', 'MEDIUM', 'OPEN', '本地/远程日志通道', '安全事件不可追踪，阻碍溯源', 'MEDIUM', '日志集中化与完整性保护', '关键日志未妥善保护。');

INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id)
SELECT r.id, t.id FROM requirements r, tara_items t WHERE r.requirement_key = 'REQ-AC-001' AND t.threat_key = 'TARA-AC-001';
INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id)
SELECT r.id, t.id FROM requirements r, tara_items t WHERE r.requirement_key = 'REQ-ADB-001' AND t.threat_key = 'TARA-ADB-001';
INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id)
SELECT r.id, t.id FROM requirements r, tara_items t WHERE r.requirement_key = 'REQ-NET-001' AND t.threat_key = 'TARA-NET-001';
INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id)
SELECT r.id, t.id FROM requirements r, tara_items t WHERE r.requirement_key = 'REQ-AUTH-001' AND t.threat_key = 'TARA-AUTH-001';
INSERT OR IGNORE INTO requirement_tara_links (requirement_id, tara_id)
SELECT r.id, t.id FROM requirements r, tara_items t WHERE r.requirement_key = 'REQ-LOG-001' AND t.threat_key = 'TARA-LOG-001';

INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 2, id FROM requirements WHERE requirement_key = 'REQ-AC-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 3, id FROM requirements WHERE requirement_key = 'REQ-ADB-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 4, id FROM requirements WHERE requirement_key = 'REQ-NET-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 5, id FROM requirements WHERE requirement_key = 'REQ-NET-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 17, id FROM requirements WHERE requirement_key = 'REQ-AUTH-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 18, id FROM requirements WHERE requirement_key = 'REQ-AUTH-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 8, id FROM requirements WHERE requirement_key = 'REQ-LOG-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 9, id FROM requirements WHERE requirement_key = 'REQ-LOG-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 19, id FROM requirements WHERE requirement_key = 'REQ-NET-001';
INSERT OR IGNORE INTO test_case_requirements (test_case_id, requirement_id)
SELECT 20, id FROM requirements WHERE requirement_key = 'REQ-NET-001';

INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 2, id FROM tara_items WHERE threat_key = 'TARA-AC-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 3, id FROM tara_items WHERE threat_key = 'TARA-ADB-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 4, id FROM tara_items WHERE threat_key = 'TARA-NET-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 5, id FROM tara_items WHERE threat_key = 'TARA-NET-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 17, id FROM tara_items WHERE threat_key = 'TARA-AUTH-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 18, id FROM tara_items WHERE threat_key = 'TARA-AUTH-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 8, id FROM tara_items WHERE threat_key = 'TARA-LOG-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 9, id FROM tara_items WHERE threat_key = 'TARA-LOG-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 19, id FROM tara_items WHERE threat_key = 'TARA-NET-001';
INSERT OR IGNORE INTO test_case_tara_links (test_case_id, tara_id)
SELECT 20, id FROM tara_items WHERE threat_key = 'TARA-NET-001';

COMMIT;
