PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE collaboration_schema_versions (
            component TEXT PRIMARY KEY,
            version INTEGER NOT NULL CHECK (version >= 1)
          );
INSERT INTO collaboration_schema_versions VALUES('core',1);
INSERT INTO collaboration_schema_versions VALUES('worktree',2);
INSERT INTO collaboration_schema_versions VALUES('history',1);
INSERT INTO collaboration_schema_versions VALUES('assets',1);
CREATE TABLE collaboration_units (
          unit_id TEXT PRIMARY KEY,
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
          created_at_ms INTEGER NOT NULL,
          soft_deleted_at_ms INTEGER
        );
INSERT INTO collaboration_units VALUES('u-muf7cuin-elnecc',2,'Plan',2,1790234431390,NULL);
INSERT INTO collaboration_units VALUES('u-muf7cun8-pkk687',1,'Notes',1,1790234431398,NULL);
CREATE TABLE collaboration_unit_tombstones (
          unit_id TEXT PRIMARY KEY,
          purged_at INTEGER NOT NULL
        );
CREATE TABLE collaboration_snapshots (
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          type INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, revision),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );
INSERT INTO collaboration_snapshots VALUES('u-muf7cuin-elnecc',1,2,'{"unitID":"u-muf7cuin-elnecc","rev":1,"type":2,"workbook":{"unitID":"u-muf7cuin-elnecc","rev":1,"creator":"","name":"Plan","sheetOrder":["sheet-1"],"sheets":{"sheet-1":{"id":"sheet-1","type":0,"name":"Sheet1","rowCount":1000,"columnCount":26,"originalMeta":{"__univerCollaborationBinary":"eyJ0YWJDb2xvciI6IiIsImhpZGRlbiI6MCwiem9vbVJhdGlvIjoxLCJmcmVlemUiOnsieFNwbGl0IjowLCJ5U3BsaXQiOjAsInN0YXJ0Um93IjotMSwic3RhcnRDb2x1bW4iOi0xfSwic2Nyb2xsVG9wIjowLCJzY3JvbGxMZWZ0IjowLCJkZWZhdWx0Q29sdW1uV2lkdGgiOjg4LCJkZWZhdWx0Um93SGVpZ2h0IjoyNCwibWVyZ2VEYXRhIjpbXSwicm93RGF0YSI6e30sImNvbHVtbkRhdGEiOnt9LCJzaG93R3JpZGxpbmVzIjoxLCJyb3dIZWFkZXIiOnsid2lkdGgiOjQ2LCJoaWRkZW4iOjB9LCJjb2x1bW5IZWFkZXIiOnsiaGVpZ2h0IjoyMCwiaGlkZGVuIjowfSwicmlnaHRUb0xlZnQiOjB9"}}},"blockMeta":{"sheet-1":{"sheetID":"sheet-1","blocks":["2286443110218434281"]}},"resources":[{"name":"UNIVER_EMBED_RESOURCE_PLUGIN","data":"{\"version\":1,\"embeds\":{}}"},{"name":"SHEET_RANGE_PROTECTION_PLUGIN","data":""},{"name":"SHEET_AuthzIoMockService_PLUGIN","data":"{}"},{"name":"SHEET_SPARKLINE_PLUGIN","data":"{}"},{"name":"SHEET_WORKSHEET_PROTECTION_PLUGIN","data":"{}"},{"name":"SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN","data":"{}"},{"name":"SHEET_CONDITIONAL_FORMATTING_PLUGIN","data":""},{"name":"SHEET_PIVOT_TABLE_PLUGIN","data":"{\"dataFieldManagerConfig\":{\"u-muf7cuin-elnecc\":{\"collections\":{},\"dataFields\":{}}},\"pivotTableConfigs\":{}}"},{"name":"SHEET_OUTLINE_PLUGIN","data":"{}"},{"name":"SHEET_DRAWING_PLUGIN","data":"{}"},{"name":"SHEET_CHART_PLUGIN","data":"{}"},{"name":"SHEET_NOTE_PLUGIN","data":""},{"name":"SHEET_SHAPE_PLUGIN","data":"{}"},{"name":"SHEET_UNIVER_THREAD_COMMENT_PLUGIN","data":"{}"},{"name":"SHEET_EXTERNAL_DATA_PLUGIN","data":"{\"schemaVersion\":1,\"links\":[]}"},{"name":"UNIVER_EXTERNAL_REFERENCE_PLUGIN","data":"{\"schemaVersion\":1,\"references\":{}}"},{"name":"SHEET_DEFINED_NAME_PLUGIN","data":""},{"name":"SHEET_RANGE_THEME_MODEL_PLUGIN","data":"{}"},{"name":"SHEET_DATA_VALIDATION_PLUGIN","data":"{}"},{"name":"SHEET_FILTER_PLUGIN","data":"{}"},{"name":"SHEET_TABLE_PLUGIN","data":"{}"}],"originalMeta":{"__univerCollaborationBinary":"eyJhcHBWZXJzaW9uIjoiMS4wLjAtcmMuMCIsImxvY2FsZSI6ImVuVVMiLCJkYXRlU3lzdGVtIjoiZGF0ZTE5MDAiLCJzdHlsZXMiOnt9fQ=="}}}');
INSERT INTO collaboration_snapshots VALUES('u-muf7cun8-pkk687',1,1,'{"unitID":"u-muf7cun8-pkk687","rev":1,"type":1,"doc":{"unitID":"u-muf7cun8-pkk687","rev":1,"creator":"","name":"Notes","resources":[{"name":"UNIVER_EMBED_RESOURCE_PLUGIN","data":"{\"version\":1,\"embeds\":{}}"},{"name":"DOC_HYPER_LINK_PLUGIN","data":"{\"links\":[]}"},{"name":"DOC_OBJECT_PERMISSION_PLUGIN","data":"[]"},{"name":"DOC_DRAWING_PLUGIN","data":"{\"data\":{},\"order\":[]}"},{"name":"DOC_CALLOUT_PLUGIN","data":"{\"callouts\":{}}"},{"name":"DOC_CHART_PLUGIN","data":"{\"version\":2,\"dataSources\":{},\"charts\":{}}"},{"name":"DOC_CODE_PLUGIN","data":"{\"codes\":{}}"},{"name":"DOC_LATEX_PLUGIN","data":"{\"formulas\":{}}"},{"name":"DOC_SHAPE_PLUGIN","data":"[]"},{"name":"DOC_TABLE_PLUGIN","data":"{\"tables\":{}}"},{"name":"DOC_UNIVER_THREAD_COMMENT_PLUGIN","data":"{}"},{"name":"UNIVER_EXTERNAL_REFERENCE_PLUGIN","data":"{\"schemaVersion\":1,\"references\":{}}"}],"originalMeta":{"__univerCollaborationBinary":"eyJsb2NhbGUiOiJlblVTIiwidGFibGVTb3VyY2UiOnt9LCJkcmF3aW5ncyI6e30sImRyYXdpbmdzT3JkZXIiOltdLCJoZWFkZXJzIjp7fSwiZm9vdGVycyI6e30sIm5vdGVzIjp7fSwibm90ZVNldHRpbmdzIjp7fSwiYm9keSI6eyJkYXRhU3RyZWFtIjoiXHJcbiIsInRleHRSdW5zIjpbXSwiY3VzdG9tQmxvY2tzIjpbXSwidGFibGVzIjpbXSwiY29sdW1uR3JvdXBzIjpbXSwiYmxvY2tSYW5nZXMiOltdLCJjdXN0b21SYW5nZXMiOltdLCJjdXN0b21EZWNvcmF0aW9ucyI6W10sInBhcmFncmFwaHMiOlt7InN0YXJ0SW5kZXgiOjAsInBhcmFncmFwaElkIjoicGFyYV92UkJzYmI5djdtQ00iLCJwYXJhZ3JhcGhTdHlsZSI6e319XSwic2VjdGlvbkJyZWFrcyI6W3sic2VjdGlvbklkIjoic2VjdGlvbl9aajRxczJreEhyVjMiLCJzdGFydEluZGV4IjoxfV19LCJkb2N1bWVudFN0eWxlIjp7InBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6MTEyMi42NjY2NjY2NjY2NjY3fSwiZG9jdW1lbnRGbGF2b3IiOjIsIm1hcmdpblRvcCI6NTAsIm1hcmdpbkJvdHRvbSI6NTAsIm1hcmdpblJpZ2h0Ijo1MCwibWFyZ2luTGVmdCI6NTAsImF1dG9IeXBoZW5hdGlvbiI6MSwiZG9Ob3RIeXBoZW5hdGVDYXBzIjowLCJjb25zZWN1dGl2ZUh5cGhlbkxpbWl0IjoyLCJkZWZhdWx0SGVhZGVySWQiOiIiLCJkZWZhdWx0Rm9vdGVySWQiOiIiLCJldmVuUGFnZUhlYWRlcklkIjoiIiwiZXZlblBhZ2VGb290ZXJJZCI6IiIsImZpcnN0UGFnZUhlYWRlcklkIjoiIiwiZmlyc3RQYWdlRm9vdGVySWQiOiIiLCJldmVuQW5kT2RkSGVhZGVycyI6MCwidXNlRmlyc3RQYWdlSGVhZGVyRm9vdGVyIjowLCJtYXJnaW5IZWFkZXIiOjMwLCJtYXJnaW5Gb290ZXIiOjMwLCJkZWZhdWx0UGFyYWdyYXBoU3R5bGUiOnsic3BhY2VBYm92ZSI6eyJ2IjowfSwibGluZVNwYWNpbmciOjEuNSwic3BhY2VCZWxvdyI6eyJ2IjoxMn19LCJyZW5kZXJDb25maWciOnsiemVyb1dpZHRoUGFyYWdyYXBoQnJlYWsiOjAsInZlcnRleEFuZ2xlIjowLCJjZW50ZXJBbmdsZSI6MCwiYmFja2dyb3VuZCI6eyJyZ2IiOiIjY2NjIn19fSwic2V0dGluZ3MiOnt9fQ=="}}}');
CREATE TABLE collaboration_changesets (
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 2),
          base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
          sid TEXT NOT NULL,
          req_id INTEGER NOT NULL CHECK (req_id >= 1),
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, revision),
          UNIQUE (unit_id, sid, req_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );
INSERT INTO collaboration_changesets VALUES('u-muf7cuin-elnecc',2,1,'8940c266-84d9-4045-ab30-7591194e66af',1,'{"unitID":"u-muf7cuin-elnecc","type":2,"baseRev":1,"revision":2,"userID":"local","memberID":"gateway-dcf0dd33-63d5-40f1-a868-cc5e3ab143ac","sid":"8940c266-84d9-4045-ab30-7591194e66af","reqId":1,"mutations":[{"id":"sheet.mutation.set-range-values","data":"{\"unitId\":\"u-muf7cuin-elnecc\",\"subUnitId\":\"sheet-1\",\"cellValue\":{\"0\":{\"1\":{\"v\":\"beta-1\",\"p\":null,\"f\":null}}},\"trigger\":\"sheet.command.set-range-values\",\"styleRefMap\":{}}"}]}');
CREATE TABLE collaboration_sheet_blocks (
          unit_id TEXT NOT NULL,
          block_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, block_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );
INSERT INTO collaboration_sheet_blocks VALUES('u-muf7cuin-elnecc','2286443110218434281','{"id":"2286443110218434281","startRow":0,"endRow":1,"data":{"__univerCollaborationBinary":"eyIwIjp7IjAiOnsidiI6ImFscGhhLTEiLCJ0IjoxfX0sIjEiOnsiMCI6eyJ2IjoyLCJ0IjoyfX19"}}');
CREATE TABLE collaboration_resources (
          unit_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, resource_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );
CREATE TABLE collaboration_worktrees (
          worktree_id TEXT PRIMARY KEY,
          sid TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('draft', 'ready', 'merging', 'merged', 'discarded')),
          agent_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          merged_at_ms INTEGER
        );
INSERT INTO collaboration_worktrees VALUES('wt-muf7cue3-rslzv0','06220472-01c8-4f25-96b5-f00bbde3c394','merged','','alpha',1790234429403,1790234431399);
INSERT INTO collaboration_worktrees VALUES('wt-muf7cw1x-8t444b','8940c266-84d9-4045-ab30-7591194e66af','merged','','beta',1790234431557,1790234433051);
INSERT INTO collaboration_worktrees VALUES('wt-muf7cxbv-whq02h','ec1c111c-0cab-4c83-aff7-8edce32ec257','draft','','gamma',1790234433211,NULL);
INSERT INTO collaboration_worktrees VALUES('wt-muf7cy22-z847ls','6f03f57d-8839-4617-9e00-d5403e273457','discarded','','discarded',1790234434154,NULL);
CREATE TABLE collaboration_worktree_units (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          unit_order INTEGER NOT NULL CHECK (unit_order >= 0),
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          source TEXT NOT NULL
            CHECK (source IN ('trunk', 'worktree')),
          baseline_trunk_revision INTEGER NOT NULL
            CHECK (baseline_trunk_revision >= 1),
          draft_head_revision INTEGER NOT NULL
            CHECK (draft_head_revision >= baseline_trunk_revision),
          ready_draft_head_revision INTEGER,
          merge_result_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          UNIQUE (worktree_id, unit_order),
          FOREIGN KEY (worktree_id)
            REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
        );
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cue3-rslzv0','u-muf7cuin-elnecc',0,2,'Plan',1790234429569,'worktree',1,3,3,'{"status":"merged","trunkRevision":1}');
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cue3-rslzv0','u-muf7cun8-pkk687',1,1,'Notes',1790234429732,'worktree',1,1,1,'{"status":"merged","trunkRevision":1}');
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cw1x-8t444b','u-muf7cuin-elnecc',0,2,'Plan',1790234431557,'trunk',1,2,2,'{"status":"merged","trunkRevision":2}');
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cw1x-8t444b','u-muf7cun8-pkk687',1,1,'Notes',1790234431557,'trunk',1,1,1,'{"status":"unchanged"}');
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cxbv-whq02h','u-muf7cuin-elnecc',0,2,'Plan',1790234433211,'trunk',2,3,NULL,NULL);
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cxbv-whq02h','u-muf7cun8-pkk687',1,1,'Notes',1790234433211,'trunk',1,1,NULL,NULL);
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cxbv-whq02h','u-muf7cxxj-lm7xb7',2,3,'Deck',1790234433991,'worktree',1,1,NULL,NULL);
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cy22-z847ls','u-muf7cuin-elnecc',0,2,'Plan',1790234434154,'trunk',2,2,NULL,NULL);
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cy22-z847ls','u-muf7cun8-pkk687',1,1,'Notes',1790234434154,'trunk',1,1,NULL,NULL);
INSERT INTO collaboration_worktree_units VALUES('wt-muf7cy22-z847ls','u-muf7cy6n-f1c1ah',2,2,'Scratch',1790234434319,'worktree',1,1,NULL,NULL);
CREATE TABLE collaboration_worktree_changesets (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 2),
          base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
          sid TEXT NOT NULL,
          req_id INTEGER NOT NULL CHECK (req_id >= 1),
          payload_json TEXT NOT NULL,
          PRIMARY KEY (worktree_id, unit_id, revision),
          UNIQUE (worktree_id, unit_id, sid, req_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );
INSERT INTO collaboration_worktree_changesets VALUES('wt-muf7cue3-rslzv0','u-muf7cuin-elnecc',2,1,'3365bc24-d912-41a1-b8e8-92d9e666628a',1,'{"baseRev":1,"mutations":[{"id":"sheet.mutation.set-range-values","data":"{\"unitId\":\"u-muf7cuin-elnecc\",\"subUnitId\":\"sheet-1\",\"cellValue\":{\"0\":{\"0\":{\"v\":\"alpha-1\",\"p\":null,\"f\":null}}},\"trigger\":\"sheet.command.set-range-values\",\"styleRefMap\":{}}"}],"reqId":1,"sid":"3365bc24-d912-41a1-b8e8-92d9e666628a","memberID":"eee5d324-612d-4322-a0b5-db59a2cbb0c2","revision":2,"type":2,"unitID":"u-muf7cuin-elnecc","userID":"local"}');
INSERT INTO collaboration_worktree_changesets VALUES('wt-muf7cue3-rslzv0','u-muf7cuin-elnecc',3,2,'3365bc24-d912-41a1-b8e8-92d9e666628a',2,'{"baseRev":2,"mutations":[{"id":"sheet.mutation.set-range-values","data":"{\"unitId\":\"u-muf7cuin-elnecc\",\"subUnitId\":\"sheet-1\",\"cellValue\":{\"1\":{\"0\":{\"v\":2,\"p\":null,\"f\":null}}},\"trigger\":\"sheet.command.set-range-values\",\"styleRefMap\":{}}"}],"reqId":2,"sid":"3365bc24-d912-41a1-b8e8-92d9e666628a","memberID":"eee5d324-612d-4322-a0b5-db59a2cbb0c2","revision":3,"type":2,"unitID":"u-muf7cuin-elnecc","userID":"local"}');
INSERT INTO collaboration_worktree_changesets VALUES('wt-muf7cw1x-8t444b','u-muf7cuin-elnecc',2,1,'0175d875-b8ea-4f29-ae07-c3da33c3fc08',1,'{"baseRev":1,"mutations":[{"id":"sheet.mutation.set-range-values","data":"{\"unitId\":\"u-muf7cuin-elnecc\",\"subUnitId\":\"sheet-1\",\"cellValue\":{\"0\":{\"1\":{\"v\":\"beta-1\",\"p\":null,\"f\":null}}},\"trigger\":\"sheet.command.set-range-values\",\"styleRefMap\":{}}"}],"reqId":1,"sid":"0175d875-b8ea-4f29-ae07-c3da33c3fc08","memberID":"ec7a0150-da9b-40a1-843f-9e17e7688263","revision":2,"type":2,"unitID":"u-muf7cuin-elnecc","userID":"local"}');
INSERT INTO collaboration_worktree_changesets VALUES('wt-muf7cxbv-whq02h','u-muf7cuin-elnecc',3,2,'0514feab-dd36-4e15-831d-aedc1c421ba3',1,'{"baseRev":2,"mutations":[{"id":"sheet.mutation.set-range-values","data":"{\"unitId\":\"u-muf7cuin-elnecc\",\"subUnitId\":\"sheet-1\",\"cellValue\":{\"0\":{\"2\":{\"v\":\"gamma-draft\",\"p\":null,\"f\":null}}},\"trigger\":\"sheet.command.set-range-values\",\"styleRefMap\":{}}"}],"reqId":1,"sid":"0514feab-dd36-4e15-831d-aedc1c421ba3","memberID":"30653259-ecaf-411a-b9f8-4454ff315a6d","revision":3,"type":2,"unitID":"u-muf7cuin-elnecc","userID":"local"}');
CREATE TABLE collaboration_worktree_unit_seeds (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          sheet_blocks_json TEXT,
          resources_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );
INSERT INTO collaboration_worktree_unit_seeds VALUES('wt-muf7cue3-rslzv0','u-muf7cuin-elnecc','{"unitID":"u-muf7cuin-elnecc","rev":1,"type":2,"workbook":{"unitID":"u-muf7cuin-elnecc","rev":1,"creator":"","name":"Plan","sheetOrder":["sheet-1"],"sheets":{"sheet-1":{"id":"sheet-1","type":0,"name":"Sheet1","rowCount":1000,"columnCount":26,"originalMeta":{"__univerCollaborationBinary":"eyJ0YWJDb2xvciI6IiIsImhpZGRlbiI6MCwiem9vbVJhdGlvIjoxLCJmcmVlemUiOnsieFNwbGl0IjowLCJ5U3BsaXQiOjAsInN0YXJ0Um93IjotMSwic3RhcnRDb2x1bW4iOi0xfSwic2Nyb2xsVG9wIjowLCJzY3JvbGxMZWZ0IjowLCJkZWZhdWx0Q29sdW1uV2lkdGgiOjg4LCJkZWZhdWx0Um93SGVpZ2h0IjoyNCwibWVyZ2VEYXRhIjpbXSwicm93RGF0YSI6e30sImNvbHVtbkRhdGEiOnt9LCJzaG93R3JpZGxpbmVzIjoxLCJyb3dIZWFkZXIiOnsid2lkdGgiOjQ2LCJoaWRkZW4iOjB9LCJjb2x1bW5IZWFkZXIiOnsiaGVpZ2h0IjoyMCwiaGlkZGVuIjowfSwicmlnaHRUb0xlZnQiOjB9"}}},"blockMeta":{"sheet-1":{"sheetID":"sheet-1","blocks":[]}},"resources":[],"originalMeta":{"__univerCollaborationBinary":"eyJhcHBWZXJzaW9uIjoiMS4wLjAtcmMuMCIsImxvY2FsZSI6ImVuVVMiLCJkYXRlU3lzdGVtIjoiZGF0ZTE5MDAiLCJzdHlsZXMiOnt9fQ=="}}}',NULL,NULL);
INSERT INTO collaboration_worktree_unit_seeds VALUES('wt-muf7cue3-rslzv0','u-muf7cun8-pkk687','{"unitID":"u-muf7cun8-pkk687","rev":1,"type":1,"doc":{"unitID":"u-muf7cun8-pkk687","rev":1,"creator":"","name":"Notes","resources":[],"originalMeta":{"__univerCollaborationBinary":"eyJsb2NhbGUiOiJlblVTIiwidGFibGVTb3VyY2UiOnt9LCJkcmF3aW5ncyI6e30sImRyYXdpbmdzT3JkZXIiOltdLCJoZWFkZXJzIjp7fSwiZm9vdGVycyI6e30sIm5vdGVzIjp7fSwibm90ZVNldHRpbmdzIjp7fSwiYm9keSI6eyJkYXRhU3RyZWFtIjoiXHJcbiIsInRleHRSdW5zIjpbXSwiY3VzdG9tQmxvY2tzIjpbXSwidGFibGVzIjpbXSwiY29sdW1uR3JvdXBzIjpbXSwiYmxvY2tSYW5nZXMiOltdLCJjdXN0b21SYW5nZXMiOltdLCJjdXN0b21EZWNvcmF0aW9ucyI6W10sInBhcmFncmFwaHMiOlt7InN0YXJ0SW5kZXgiOjAsInBhcmFncmFwaElkIjoicGFyYV92UkJzYmI5djdtQ00iLCJwYXJhZ3JhcGhTdHlsZSI6e319XSwic2VjdGlvbkJyZWFrcyI6W3sic2VjdGlvbklkIjoic2VjdGlvbl9aajRxczJreEhyVjMiLCJzdGFydEluZGV4IjoxfV19LCJkb2N1bWVudFN0eWxlIjp7InBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6MTEyMi42NjY2NjY2NjY2NjY3fSwiZG9jdW1lbnRGbGF2b3IiOjIsIm1hcmdpblRvcCI6NTAsIm1hcmdpbkJvdHRvbSI6NTAsIm1hcmdpblJpZ2h0Ijo1MCwibWFyZ2luTGVmdCI6NTAsImF1dG9IeXBoZW5hdGlvbiI6MSwiZG9Ob3RIeXBoZW5hdGVDYXBzIjowLCJjb25zZWN1dGl2ZUh5cGhlbkxpbWl0IjoyLCJkZWZhdWx0SGVhZGVySWQiOiIiLCJkZWZhdWx0Rm9vdGVySWQiOiIiLCJldmVuUGFnZUhlYWRlcklkIjoiIiwiZXZlblBhZ2VGb290ZXJJZCI6IiIsImZpcnN0UGFnZUhlYWRlcklkIjoiIiwiZmlyc3RQYWdlRm9vdGVySWQiOiIiLCJldmVuQW5kT2RkSGVhZGVycyI6MCwidXNlRmlyc3RQYWdlSGVhZGVyRm9vdGVyIjowLCJtYXJnaW5IZWFkZXIiOjMwLCJtYXJnaW5Gb290ZXIiOjMwLCJkZWZhdWx0UGFyYWdyYXBoU3R5bGUiOnsic3BhY2VBYm92ZSI6eyJ2IjowfSwibGluZVNwYWNpbmciOjEuNSwic3BhY2VCZWxvdyI6eyJ2IjoxMn19LCJyZW5kZXJDb25maWciOnsiemVyb1dpZHRoUGFyYWdyYXBoQnJlYWsiOjAsInZlcnRleEFuZ2xlIjowLCJjZW50ZXJBbmdsZSI6MCwiYmFja2dyb3VuZCI6eyJyZ2IiOiIjY2NjIn19fSwic2V0dGluZ3MiOnt9fQ=="}}}',NULL,NULL);
INSERT INTO collaboration_worktree_unit_seeds VALUES('wt-muf7cxbv-whq02h','u-muf7cxxj-lm7xb7','{"unitID":"u-muf7cxxj-lm7xb7","rev":1,"type":3,"slide":{"unitID":"u-muf7cxxj-lm7xb7","rev":1,"creator":"","name":"Deck","resources":[],"originalMeta":{"__univerCollaborationBinary":"eyJpZCI6InUtbXVmN2N4eGotbG03eGI3IiwibmFtZSI6IkRlY2siLCJhcHBWZXJzaW9uIjoiMS4wLjAtcmMuMCIsImxvY2FsZSI6ImVuVVMiLCJkZWZhdWx0UGFnZVNpemUiOnsid2lkdGgiOjk2MCwiaGVpZ2h0Ijo1NDB9LCJzbGlkZU9yZGVyIjpbIlVSUVJldCJdLCJzbGlkZXMiOnsiVVJRUmV0Ijp7ImlkIjoiVVJRUmV0IiwicGFnZVR5cGUiOiJzbGlkZSIsIm5hbWUiOiJTbGlkZSAxIiwibWFzdGVyUGFnZUlkIjoibWFzdGVyLWRlZmF1bHQiLCJsYXlvdXRQYWdlSWQiOiJsYXlvdXQtdGl0bGUtYm9keSIsImVsZW1lbnRPcmRlciI6W10sImVsZW1lbnRzIjp7fSwic2hvd01hc3RlclNwIjp0cnVlfX0sImFjdGl2ZVNsaWRlSWQiOiJVUlFSZXQiLCJ0aGVtZSI6eyJpZCI6Im9mZmljZSIsIm5hbWUiOiJPZmZpY2UgVGhlbWUiLCJjb2xvclNjaGVtZSI6eyJkazEiOiIjMDAwMDAwIiwibHQxIjoiI2ZmZmZmZiIsImRrMiI6IiM0NDU0NmEiLCJsdDIiOiIjZTdlNmU2IiwiYWNjMSI6IiM0NDcyYzQiLCJhY2MyIjoiI2VkN2QzMSIsImFjYzMiOiIjYTVhNWE1IiwiYWNjNCI6IiNmZmMwMDAiLCJhY2M1IjoiIzViOWJkNSIsImFjYzYiOiIjNzBhZDQ3IiwiaGxpbmsiOiIjMDU2M2MxIiwiZm9sSGxpbmsiOiIjOTU0ZjcyIn0sImZvbnRTY2hlbWUiOnsiaGVhZGluZyI6IkNhbGlicmkgTGlnaHQiLCJib2R5IjoiQ2FsaWJyaSJ9LCJmbXRTY2hlbWUiOnsibmFtZSI6Ik9mZmljZSIsImZpbGxTdHlsZUxzdCI6W3siZmlsbFR5cGUiOjIsImNvbG9yIjoiIzQ0NzJjNCIsIm9wYWNpdHkiOjAuMn0seyJmaWxsVHlwZSI6MiwiY29sb3IiOiIjNDQ3MmM0Iiwib3BhY2l0eSI6MX0seyJmaWxsVHlwZSI6MywiZ3JhZGllbnRBbmdsZSI6OTAsImdyYWRpZW50U3RvcHMiOlt7InBvc2l0aW9uIjowLCJjb2xvciI6IiM1YjliZDUifSx7InBvc2l0aW9uIjoxLCJjb2xvciI6IiM0NDcyYzQifV19XSwibG5TdHlsZUxzdCI6W3sibGluZVN0cm9rZVR5cGUiOjIsImNvbG9yIjoiIzQ0NzJjNCIsIndpZHRoIjoxLCJvcGFjaXR5IjoxfSx7ImxpbmVTdHJva2VUeXBlIjoyLCJjb2xvciI6IiM0NDU0NmEiLCJ3aWR0aCI6MS41LCJvcGFjaXR5IjoxfSx7ImxpbmVTdHJva2VUeXBlIjoyLCJjb2xvciI6IiMwMDAwMDAiLCJ3aWR0aCI6Mi4yNSwib3BhY2l0eSI6MX1dLCJlZmZlY3RTdHlsZUxzdCI6W3t9LHsib3V0ZXJTaGFkb3ciOnsiY29sb3IiOiJyZ2JhKDAsIDAsIDAsIDAuMTgpIiwiYmx1clJhZGl1cyI6NCwiZGlyZWN0aW9uIjo0NSwiZGlzdGFuY2UiOjIsInJvdGF0ZVdpdGhTaGFwZSI6ZmFsc2V9fSx7Im91dGVyU2hhZG93Ijp7ImNvbG9yIjoicmdiYSgwLCAwLCAwLCAwLjI4KSIsImJsdXJSYWRpdXMiOjgsImRpcmVjdGlvbiI6NDUsImRpc3RhbmNlIjo0LCJyb3RhdGVXaXRoU2hhcGUiOmZhbHNlfX1dLCJiZ0ZpbGxTdHlsZUxzdCI6W3siZmlsbFR5cGUiOjIsImNvbG9yIjoiI2ZmZmZmZiIsIm9wYWNpdHkiOjF9LHsiZmlsbFR5cGUiOjIsImNvbG9yIjoiI2U3ZTZlNiIsIm9wYWNpdHkiOjF9LHsiZmlsbFR5cGUiOjMsImdyYWRpZW50QW5nbGUiOjkwLCJncmFkaWVudFN0b3BzIjpbeyJwb3NpdGlvbiI6MCwiY29sb3IiOiIjZmZmZmZmIn0seyJwb3NpdGlvbiI6MSwiY29sb3IiOiIjZTdlNmU2In1dfV19fSwibWFzdGVyUGFnZU9yZGVyIjpbIm1hc3Rlci1kZWZhdWx0Il0sIm1hc3RlclBhZ2VzIjp7Im1hc3Rlci1kZWZhdWx0Ijp7ImlkIjoibWFzdGVyLWRlZmF1bHQiLCJwYWdlVHlwZSI6Im1hc3RlciIsIm5hbWUiOiJPZmZpY2UgVGhlbWUiLCJwYWdlU2l6ZSI6eyJ3aWR0aCI6OTYwLCJoZWlnaHQiOjU0MH0sImVsZW1lbnRPcmRlciI6W10sImVsZW1lbnRzIjp7fSwiYmFja2dyb3VuZCI6eyJ0eXBlIjoic29saWQiLCJjb2xvciI6IiNmZmZmZmYifX19LCJsYXlvdXRQYWdlT3JkZXIiOlsibGF5b3V0LXRpdGxlIiwibGF5b3V0LXRpdGxlLWJvZHkiLCJsYXlvdXQtc2VjdGlvbi1oZWFkZXIiLCJsYXlvdXQtdHdvLWNvbHVtbnMiLCJsYXlvdXQtY29tcGFyaXNvbiIsImxheW91dC1ibGFuayIsImxheW91dC10aXRsZS1vbmx5IiwibGF5b3V0LXBpY3R1cmUtY2FwdGlvbiJdLCJsYXlvdXRQYWdlcyI6eyJsYXlvdXQtdGl0bGUiOnsiaWQiOiJsYXlvdXQtdGl0bGUiLCJwYWdlVHlwZSI6ImxheW91dCIsImxheW91dFR5cGUiOiJ0aXRsZSIsIm5hbWUiOiJUaXRsZSBTbGlkZSIsIm1hc3RlclBhZ2VJZCI6Im1hc3Rlci1kZWZhdWx0IiwicGFnZVNpemUiOnsid2lkdGgiOjk2MCwiaGVpZ2h0Ijo1NDB9LCJlbGVtZW50T3JkZXIiOlsicGgtY2VudGVyLXRpdGxlIiwicGgtc3VidGl0bGUiXSwiZWxlbWVudHMiOnsicGgtY2VudGVyLXRpdGxlIjp7ImlkIjoicGgtY2VudGVyLXRpdGxlIiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ4LCJ0b3AiOjE1MS4yMDAwMDAwMDAwMDAwMiwid2lkdGgiOjg2NCwiaGVpZ2h0IjoxMDB9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLWNlbnRlci10aXRsZSIsInR5cGUiOiJjZW50ZXJUaXRsZSJ9fSwicGgtc3VidGl0bGUiOnsiaWQiOiJwaC1zdWJ0aXRsZSIsInR5cGUiOiJwbGFjZWhvbGRlciIsInRyYW5zZm9ybSI6eyJsZWZ0Ijo0OCwidG9wIjoyNjcuMjAwMDAwMDAwMDAwMDUsIndpZHRoIjo4NjQsImhlaWdodCI6NTZ9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLXN1YnRpdGxlIiwidHlwZSI6InN1YnRpdGxlIn19fX0sImxheW91dC10aXRsZS1ib2R5Ijp7ImlkIjoibGF5b3V0LXRpdGxlLWJvZHkiLCJwYWdlVHlwZSI6ImxheW91dCIsImxheW91dFR5cGUiOiJ0aXRsZUFuZEJvZHkiLCJuYW1lIjoiVGl0bGUgYW5kIENvbnRlbnQiLCJtYXN0ZXJQYWdlSWQiOiJtYXN0ZXItZGVmYXVsdCIsInBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6NTQwfSwiZWxlbWVudE9yZGVyIjpbInBoLXRpdGxlIiwicGgtYm9keSJdLCJlbGVtZW50cyI6eyJwaC10aXRsZSI6eyJpZCI6InBoLXRpdGxlIiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ4LCJ0b3AiOjMyLCJ3aWR0aCI6ODY0LCJoZWlnaHQiOjc2fSwicGxhY2Vob2xkZXIiOnsiaWQiOiJwaC10aXRsZSIsInR5cGUiOiJ0aXRsZSJ9fSwicGgtYm9keSI6eyJpZCI6InBoLWJvZHkiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MTI4LCJ3aWR0aCI6ODY0LCJoZWlnaHQiOjM4MH0sInBsYWNlaG9sZGVyIjp7ImlkIjoicGgtYm9keSIsInR5cGUiOiJib2R5In19fX0sImxheW91dC1zZWN0aW9uLWhlYWRlciI6eyJpZCI6ImxheW91dC1zZWN0aW9uLWhlYWRlciIsInBhZ2VUeXBlIjoibGF5b3V0IiwibGF5b3V0VHlwZSI6InNlY3Rpb25IZWFkZXIiLCJuYW1lIjoiU2VjdGlvbiBIZWFkZXIiLCJtYXN0ZXJQYWdlSWQiOiJtYXN0ZXItZGVmYXVsdCIsInBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6NTQwfSwiZWxlbWVudE9yZGVyIjpbInBoLWNlbnRlci10aXRsZSIsInBoLXRleHQiXSwiZWxlbWVudHMiOnsicGgtY2VudGVyLXRpdGxlIjp7ImlkIjoicGgtY2VudGVyLXRpdGxlIiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ4LCJ0b3AiOjEzNSwid2lkdGgiOjg2NCwiaGVpZ2h0IjoxMDB9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLWNlbnRlci10aXRsZSIsInR5cGUiOiJjZW50ZXJUaXRsZSJ9fSwicGgtdGV4dCI6eyJpZCI6InBoLXRleHQiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MjUxLCJ3aWR0aCI6ODY0LCJoZWlnaHQiOjU2fSwicGxhY2Vob2xkZXIiOnsiaWQiOiJwaC10ZXh0IiwidHlwZSI6InRleHQifX19fSwibGF5b3V0LXR3by1jb2x1bW5zIjp7ImlkIjoibGF5b3V0LXR3by1jb2x1bW5zIiwicGFnZVR5cGUiOiJsYXlvdXQiLCJsYXlvdXRUeXBlIjoidHdvQ29sdW1ucyIsIm5hbWUiOiJUd28gQ29udGVudCIsIm1hc3RlclBhZ2VJZCI6Im1hc3Rlci1kZWZhdWx0IiwicGFnZVNpemUiOnsid2lkdGgiOjk2MCwiaGVpZ2h0Ijo1NDB9LCJlbGVtZW50T3JkZXIiOlsicGgtdGl0bGUiLCJwaC1ib2R5LWxlZnQiLCJwaC1ib2R5LXJpZ2h0Il0sImVsZW1lbnRzIjp7InBoLXRpdGxlIjp7ImlkIjoicGgtdGl0bGUiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MzIsIndpZHRoIjo4NjQsImhlaWdodCI6NzZ9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLXRpdGxlIiwidHlwZSI6InRpdGxlIn19LCJwaC1ib2R5LWxlZnQiOnsiaWQiOiJwaC1ib2R5LWxlZnQiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MTI4LCJ3aWR0aCI6NDIyLCJoZWlnaHQiOjM4MH0sInBsYWNlaG9sZGVyIjp7ImlkIjoicGgtYm9keS1sZWZ0IiwidHlwZSI6ImJvZHkiLCJpbmRleCI6MX19LCJwaC1ib2R5LXJpZ2h0Ijp7ImlkIjoicGgtYm9keS1yaWdodCIsInR5cGUiOiJwbGFjZWhvbGRlciIsInRyYW5zZm9ybSI6eyJsZWZ0Ijo0OTAsInRvcCI6MTI4LCJ3aWR0aCI6NDIyLCJoZWlnaHQiOjM4MH0sInBsYWNlaG9sZGVyIjp7ImlkIjoicGgtYm9keS1yaWdodCIsInR5cGUiOiJib2R5IiwiaW5kZXgiOjJ9fX19LCJsYXlvdXQtY29tcGFyaXNvbiI6eyJpZCI6ImxheW91dC1jb21wYXJpc29uIiwicGFnZVR5cGUiOiJsYXlvdXQiLCJsYXlvdXRUeXBlIjoiY29tcGFyaXNvbiIsIm5hbWUiOiJDb21wYXJpc29uIiwibWFzdGVyUGFnZUlkIjoibWFzdGVyLWRlZmF1bHQiLCJwYWdlU2l6ZSI6eyJ3aWR0aCI6OTYwLCJoZWlnaHQiOjU0MH0sImVsZW1lbnRPcmRlciI6WyJwaC10aXRsZSIsInBoLXRleHQtbGVmdCIsInBoLXRleHQtcmlnaHQiLCJwaC1ib2R5LWxlZnQiLCJwaC1ib2R5LXJpZ2h0Il0sImVsZW1lbnRzIjp7InBoLXRpdGxlIjp7ImlkIjoicGgtdGl0bGUiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MzIsIndpZHRoIjo4NjQsImhlaWdodCI6NzZ9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLXRpdGxlIiwidHlwZSI6InRpdGxlIn19LCJwaC10ZXh0LWxlZnQiOnsiaWQiOiJwaC10ZXh0LWxlZnQiLCJ0eXBlIjoicGxhY2Vob2xkZXIiLCJ0cmFuc2Zvcm0iOnsibGVmdCI6NDgsInRvcCI6MTI4LCJ3aWR0aCI6NDIyLCJoZWlnaHQiOjQwfSwicGxhY2Vob2xkZXIiOnsiaWQiOiJwaC10ZXh0LWxlZnQiLCJ0eXBlIjoidGV4dCIsImluZGV4IjoxfX0sInBoLXRleHQtcmlnaHQiOnsiaWQiOiJwaC10ZXh0LXJpZ2h0IiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ5MCwidG9wIjoxMjgsIndpZHRoIjo0MjIsImhlaWdodCI6NDB9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLXRleHQtcmlnaHQiLCJ0eXBlIjoidGV4dCIsImluZGV4IjoyfX0sInBoLWJvZHktbGVmdCI6eyJpZCI6InBoLWJvZHktbGVmdCIsInR5cGUiOiJwbGFjZWhvbGRlciIsInRyYW5zZm9ybSI6eyJsZWZ0Ijo0OCwidG9wIjoxNzYsIndpZHRoIjo0MjIsImhlaWdodCI6MzMyfSwicGxhY2Vob2xkZXIiOnsiaWQiOiJwaC1ib2R5LWxlZnQiLCJ0eXBlIjoiYm9keSIsImluZGV4IjoxfX0sInBoLWJvZHktcmlnaHQiOnsiaWQiOiJwaC1ib2R5LXJpZ2h0IiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ5MCwidG9wIjoxNzYsIndpZHRoIjo0MjIsImhlaWdodCI6MzMyfSwicGxhY2Vob2xkZXIiOnsiaWQiOiJwaC1ib2R5LXJpZ2h0IiwidHlwZSI6ImJvZHkiLCJpbmRleCI6Mn19fX0sImxheW91dC1ibGFuayI6eyJpZCI6ImxheW91dC1ibGFuayIsInBhZ2VUeXBlIjoibGF5b3V0IiwibGF5b3V0VHlwZSI6ImJsYW5rIiwibmFtZSI6IkJsYW5rIiwibWFzdGVyUGFnZUlkIjoibWFzdGVyLWRlZmF1bHQiLCJwYWdlU2l6ZSI6eyJ3aWR0aCI6OTYwLCJoZWlnaHQiOjU0MH0sImVsZW1lbnRPcmRlciI6W10sImVsZW1lbnRzIjp7fX0sImxheW91dC10aXRsZS1vbmx5Ijp7ImlkIjoibGF5b3V0LXRpdGxlLW9ubHkiLCJwYWdlVHlwZSI6ImxheW91dCIsImxheW91dFR5cGUiOiJ0aXRsZU9ubHkiLCJuYW1lIjoiVGl0bGUgT25seSIsIm1hc3RlclBhZ2VJZCI6Im1hc3Rlci1kZWZhdWx0IiwicGFnZVNpemUiOnsid2lkdGgiOjk2MCwiaGVpZ2h0Ijo1NDB9LCJlbGVtZW50T3JkZXIiOlsicGgtdGl0bGUiXSwiZWxlbWVudHMiOnsicGgtdGl0bGUiOnsiaWQiOiJwaC10aXRsZSIsInR5cGUiOiJwbGFjZWhvbGRlciIsInRyYW5zZm9ybSI6eyJsZWZ0Ijo0OCwidG9wIjozMiwid2lkdGgiOjg2NCwiaGVpZ2h0Ijo3Nn0sInBsYWNlaG9sZGVyIjp7ImlkIjoicGgtdGl0bGUiLCJ0eXBlIjoidGl0bGUifX19fSwibGF5b3V0LXBpY3R1cmUtY2FwdGlvbiI6eyJpZCI6ImxheW91dC1waWN0dXJlLWNhcHRpb24iLCJwYWdlVHlwZSI6ImxheW91dCIsImxheW91dFR5cGUiOiJwaWN0dXJlV2l0aENhcHRpb24iLCJuYW1lIjoiUGljdHVyZSB3aXRoIENhcHRpb24iLCJtYXN0ZXJQYWdlSWQiOiJtYXN0ZXItZGVmYXVsdCIsInBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6NTQwfSwiZWxlbWVudE9yZGVyIjpbInBoLXBpY3R1cmUiLCJwaC1jYXB0aW9uIl0sImVsZW1lbnRzIjp7InBoLXBpY3R1cmUiOnsiaWQiOiJwaC1waWN0dXJlIiwidHlwZSI6InBsYWNlaG9sZGVyIiwidHJhbnNmb3JtIjp7ImxlZnQiOjQ4LCJ0b3AiOjMyLCJ3aWR0aCI6ODY0LCJoZWlnaHQiOjM4OH0sInBsYWNlaG9sZGVyIjp7ImlkIjoicGgtcGljdHVyZSIsInR5cGUiOiJwaWN0dXJlIn19LCJwaC1jYXB0aW9uIjp7ImlkIjoicGgtY2FwdGlvbiIsInR5cGUiOiJwbGFjZWhvbGRlciIsInRyYW5zZm9ybSI6eyJsZWZ0Ijo0OCwidG9wIjo0MzYsIndpZHRoIjo4NjQsImhlaWdodCI6NTZ9LCJwbGFjZWhvbGRlciI6eyJpZCI6InBoLWNhcHRpb24iLCJ0eXBlIjoidGV4dCJ9fX19fSwicmV2IjoxfQ=="}}}',NULL,NULL);
INSERT INTO collaboration_worktree_unit_seeds VALUES('wt-muf7cy22-z847ls','u-muf7cy6n-f1c1ah','{"unitID":"u-muf7cy6n-f1c1ah","rev":1,"type":2,"workbook":{"unitID":"u-muf7cy6n-f1c1ah","rev":1,"creator":"","name":"Scratch","sheetOrder":["sheet-1"],"sheets":{"sheet-1":{"id":"sheet-1","type":0,"name":"Sheet1","rowCount":1000,"columnCount":26,"originalMeta":{"__univerCollaborationBinary":"eyJ0YWJDb2xvciI6IiIsImhpZGRlbiI6MCwiem9vbVJhdGlvIjoxLCJmcmVlemUiOnsieFNwbGl0IjowLCJ5U3BsaXQiOjAsInN0YXJ0Um93IjotMSwic3RhcnRDb2x1bW4iOi0xfSwic2Nyb2xsVG9wIjowLCJzY3JvbGxMZWZ0IjowLCJkZWZhdWx0Q29sdW1uV2lkdGgiOjg4LCJkZWZhdWx0Um93SGVpZ2h0IjoyNCwibWVyZ2VEYXRhIjpbXSwicm93RGF0YSI6e30sImNvbHVtbkRhdGEiOnt9LCJzaG93R3JpZGxpbmVzIjoxLCJyb3dIZWFkZXIiOnsid2lkdGgiOjQ2LCJoaWRkZW4iOjB9LCJjb2x1bW5IZWFkZXIiOnsiaGVpZ2h0IjoyMCwiaGlkZGVuIjowfSwicmlnaHRUb0xlZnQiOjB9"}}},"blockMeta":{"sheet-1":{"sheetID":"sheet-1","blocks":[]}},"resources":[],"originalMeta":{"__univerCollaborationBinary":"eyJhcHBWZXJzaW9uIjoiMS4wLjAtcmMuMCIsImxvY2FsZSI6ImVuVVMiLCJkYXRlU3lzdGVtIjoiZGF0ZTE5MDAiLCJzdHlsZXMiOnt9fQ=="}}}',NULL,NULL);
CREATE TABLE collaboration_worktree_unit_merge_artifacts (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          ready_draft_head_revision INTEGER NOT NULL
            CHECK (ready_draft_head_revision >= 1),
          snapshot_json TEXT NOT NULL,
          sheet_blocks_json TEXT,
          resources_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );
INSERT INTO collaboration_worktree_unit_merge_artifacts VALUES('wt-muf7cue3-rslzv0','u-muf7cuin-elnecc',3,'{"unitID":"u-muf7cuin-elnecc","rev":1,"type":2,"workbook":{"unitID":"u-muf7cuin-elnecc","rev":1,"creator":"","name":"Plan","sheetOrder":["sheet-1"],"sheets":{"sheet-1":{"id":"sheet-1","type":0,"name":"Sheet1","rowCount":1000,"columnCount":26,"originalMeta":{"__univerCollaborationBinary":"eyJ0YWJDb2xvciI6IiIsImhpZGRlbiI6MCwiem9vbVJhdGlvIjoxLCJmcmVlemUiOnsieFNwbGl0IjowLCJ5U3BsaXQiOjAsInN0YXJ0Um93IjotMSwic3RhcnRDb2x1bW4iOi0xfSwic2Nyb2xsVG9wIjowLCJzY3JvbGxMZWZ0IjowLCJkZWZhdWx0Q29sdW1uV2lkdGgiOjg4LCJkZWZhdWx0Um93SGVpZ2h0IjoyNCwibWVyZ2VEYXRhIjpbXSwicm93RGF0YSI6e30sImNvbHVtbkRhdGEiOnt9LCJzaG93R3JpZGxpbmVzIjoxLCJyb3dIZWFkZXIiOnsid2lkdGgiOjQ2LCJoaWRkZW4iOjB9LCJjb2x1bW5IZWFkZXIiOnsiaGVpZ2h0IjoyMCwiaGlkZGVuIjowfSwicmlnaHRUb0xlZnQiOjB9"}}},"blockMeta":{"sheet-1":{"sheetID":"sheet-1","blocks":["2286443110218434281"]}},"resources":[{"name":"UNIVER_EMBED_RESOURCE_PLUGIN","data":"{\"version\":1,\"embeds\":{}}"},{"name":"SHEET_RANGE_PROTECTION_PLUGIN","data":""},{"name":"SHEET_AuthzIoMockService_PLUGIN","data":"{}"},{"name":"SHEET_SPARKLINE_PLUGIN","data":"{}"},{"name":"SHEET_WORKSHEET_PROTECTION_PLUGIN","data":"{}"},{"name":"SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN","data":"{}"},{"name":"SHEET_CONDITIONAL_FORMATTING_PLUGIN","data":""},{"name":"SHEET_PIVOT_TABLE_PLUGIN","data":"{\"dataFieldManagerConfig\":{\"u-muf7cuin-elnecc\":{\"collections\":{},\"dataFields\":{}}},\"pivotTableConfigs\":{}}"},{"name":"SHEET_OUTLINE_PLUGIN","data":"{}"},{"name":"SHEET_DRAWING_PLUGIN","data":"{}"},{"name":"SHEET_CHART_PLUGIN","data":"{}"},{"name":"SHEET_NOTE_PLUGIN","data":""},{"name":"SHEET_SHAPE_PLUGIN","data":"{}"},{"name":"SHEET_UNIVER_THREAD_COMMENT_PLUGIN","data":"{}"},{"name":"SHEET_EXTERNAL_DATA_PLUGIN","data":"{\"schemaVersion\":1,\"links\":[]}"},{"name":"UNIVER_EXTERNAL_REFERENCE_PLUGIN","data":"{\"schemaVersion\":1,\"references\":{}}"},{"name":"SHEET_DEFINED_NAME_PLUGIN","data":""},{"name":"SHEET_RANGE_THEME_MODEL_PLUGIN","data":"{}"},{"name":"SHEET_DATA_VALIDATION_PLUGIN","data":"{}"},{"name":"SHEET_FILTER_PLUGIN","data":"{}"},{"name":"SHEET_TABLE_PLUGIN","data":"{}"}],"originalMeta":{"__univerCollaborationBinary":"eyJhcHBWZXJzaW9uIjoiMS4wLjAtcmMuMCIsImxvY2FsZSI6ImVuVVMiLCJkYXRlU3lzdGVtIjoiZGF0ZTE5MDAiLCJzdHlsZXMiOnt9fQ=="}}}','[{"id":"2286443110218434281","startRow":0,"endRow":1,"data":{"__univerCollaborationBinary":"eyIwIjp7IjAiOnsidiI6ImFscGhhLTEiLCJ0IjoxfX0sIjEiOnsiMCI6eyJ2IjoyLCJ0IjoyfX19"}}]',NULL);
INSERT INTO collaboration_worktree_unit_merge_artifacts VALUES('wt-muf7cue3-rslzv0','u-muf7cun8-pkk687',1,'{"unitID":"u-muf7cun8-pkk687","rev":1,"type":1,"doc":{"unitID":"u-muf7cun8-pkk687","rev":1,"creator":"","name":"Notes","resources":[{"name":"UNIVER_EMBED_RESOURCE_PLUGIN","data":"{\"version\":1,\"embeds\":{}}"},{"name":"DOC_HYPER_LINK_PLUGIN","data":"{\"links\":[]}"},{"name":"DOC_OBJECT_PERMISSION_PLUGIN","data":"[]"},{"name":"DOC_DRAWING_PLUGIN","data":"{\"data\":{},\"order\":[]}"},{"name":"DOC_CALLOUT_PLUGIN","data":"{\"callouts\":{}}"},{"name":"DOC_CHART_PLUGIN","data":"{\"version\":2,\"dataSources\":{},\"charts\":{}}"},{"name":"DOC_CODE_PLUGIN","data":"{\"codes\":{}}"},{"name":"DOC_LATEX_PLUGIN","data":"{\"formulas\":{}}"},{"name":"DOC_SHAPE_PLUGIN","data":"[]"},{"name":"DOC_TABLE_PLUGIN","data":"{\"tables\":{}}"},{"name":"DOC_UNIVER_THREAD_COMMENT_PLUGIN","data":"{}"},{"name":"UNIVER_EXTERNAL_REFERENCE_PLUGIN","data":"{\"schemaVersion\":1,\"references\":{}}"}],"originalMeta":{"__univerCollaborationBinary":"eyJsb2NhbGUiOiJlblVTIiwidGFibGVTb3VyY2UiOnt9LCJkcmF3aW5ncyI6e30sImRyYXdpbmdzT3JkZXIiOltdLCJoZWFkZXJzIjp7fSwiZm9vdGVycyI6e30sIm5vdGVzIjp7fSwibm90ZVNldHRpbmdzIjp7fSwiYm9keSI6eyJkYXRhU3RyZWFtIjoiXHJcbiIsInRleHRSdW5zIjpbXSwiY3VzdG9tQmxvY2tzIjpbXSwidGFibGVzIjpbXSwiY29sdW1uR3JvdXBzIjpbXSwiYmxvY2tSYW5nZXMiOltdLCJjdXN0b21SYW5nZXMiOltdLCJjdXN0b21EZWNvcmF0aW9ucyI6W10sInBhcmFncmFwaHMiOlt7InN0YXJ0SW5kZXgiOjAsInBhcmFncmFwaElkIjoicGFyYV92UkJzYmI5djdtQ00iLCJwYXJhZ3JhcGhTdHlsZSI6e319XSwic2VjdGlvbkJyZWFrcyI6W3sic2VjdGlvbklkIjoic2VjdGlvbl9aajRxczJreEhyVjMiLCJzdGFydEluZGV4IjoxfV19LCJkb2N1bWVudFN0eWxlIjp7InBhZ2VTaXplIjp7IndpZHRoIjo5NjAsImhlaWdodCI6MTEyMi42NjY2NjY2NjY2NjY3fSwiZG9jdW1lbnRGbGF2b3IiOjIsIm1hcmdpblRvcCI6NTAsIm1hcmdpbkJvdHRvbSI6NTAsIm1hcmdpblJpZ2h0Ijo1MCwibWFyZ2luTGVmdCI6NTAsImF1dG9IeXBoZW5hdGlvbiI6MSwiZG9Ob3RIeXBoZW5hdGVDYXBzIjowLCJjb25zZWN1dGl2ZUh5cGhlbkxpbWl0IjoyLCJkZWZhdWx0SGVhZGVySWQiOiIiLCJkZWZhdWx0Rm9vdGVySWQiOiIiLCJldmVuUGFnZUhlYWRlcklkIjoiIiwiZXZlblBhZ2VGb290ZXJJZCI6IiIsImZpcnN0UGFnZUhlYWRlcklkIjoiIiwiZmlyc3RQYWdlRm9vdGVySWQiOiIiLCJldmVuQW5kT2RkSGVhZGVycyI6MCwidXNlRmlyc3RQYWdlSGVhZGVyRm9vdGVyIjowLCJtYXJnaW5IZWFkZXIiOjMwLCJtYXJnaW5Gb290ZXIiOjMwLCJkZWZhdWx0UGFyYWdyYXBoU3R5bGUiOnsic3BhY2VBYm92ZSI6eyJ2IjowfSwibGluZVNwYWNpbmciOjEuNSwic3BhY2VCZWxvdyI6eyJ2IjoxMn19LCJyZW5kZXJDb25maWciOnsiemVyb1dpZHRoUGFyYWdyYXBoQnJlYWsiOjAsInZlcnRleEFuZ2xlIjowLCJjZW50ZXJBbmdsZSI6MCwiYmFja2dyb3VuZCI6eyJyZ2IiOiIjY2NjIn19fSwic2V0dGluZ3MiOnt9fQ=="}}}',NULL,NULL);
CREATE TABLE collaboration_worktree_deleted_units (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('trunk', 'worktree')),
          baseline_trunk_revision INTEGER NOT NULL
            CHECK (baseline_trunk_revision >= 1),
          deleted_at_ms INTEGER NOT NULL,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id)
            REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
        );
CREATE TABLE collaboration_history_revisions (
          unit_id TEXT NOT NULL,
          type INTEGER NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          user_id TEXT NOT NULL,
          commands_json TEXT NOT NULL,
          committed_at INTEGER NOT NULL CHECK (committed_at >= 0),
          additional_fields TEXT,
          origin INTEGER NOT NULL,
          history_revision INTEGER NOT NULL CHECK (history_revision >= 1),
          force_next_history INTEGER NOT NULL,
          restored_revision INTEGER,
          PRIMARY KEY (unit_id, revision)
        );
INSERT INTO collaboration_history_revisions VALUES('u-muf7cuin-elnecc',2,1,'local','["univer.mutation.create-unit"]',1790234431391,NULL,1,1,0,NULL);
INSERT INTO collaboration_history_revisions VALUES('u-muf7cun8-pkk687',1,1,'local','["univer.mutation.create-unit"]',1790234431398,NULL,1,1,0,NULL);
INSERT INTO collaboration_history_revisions VALUES('u-muf7cuin-elnecc',2,2,'local','["sheet.mutation.set-range-values"]',1790234433050,NULL,1,1,0,NULL);
CREATE TABLE collaboration_asset_blobs (
          digest TEXT PRIMARY KEY CHECK (length(digest) = 64),
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          bytes BLOB NOT NULL
        ) STRICT, WITHOUT ROWID;
CREATE TABLE collaboration_assets (
          asset_id TEXT PRIMARY KEY,
          unit_id TEXT NOT NULL,
          worktree_id TEXT,
          digest TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          media_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          FOREIGN KEY (digest) REFERENCES collaboration_asset_blobs(digest) ON DELETE RESTRICT
        ) STRICT;
CREATE INDEX collaboration_snapshots_nearest_revision
          ON collaboration_snapshots(unit_id, revision DESC);
CREATE INDEX collaboration_changesets_revision_range
          ON collaboration_changesets(unit_id, revision ASC);
CREATE INDEX collaboration_worktree_changesets_revision
          ON collaboration_worktree_changesets(
            worktree_id, unit_id, revision ASC
          );
CREATE INDEX collaboration_history_record_lookup
          ON collaboration_history_revisions(unit_id, history_revision DESC);
CREATE INDEX collaboration_history_creator_lookup
          ON collaboration_history_revisions(unit_id, user_id);
CREATE INDEX collaboration_assets_scope
          ON collaboration_assets(unit_id, worktree_id, created_at_ms, asset_id);
COMMIT;
