import { completeUniverfileSQLiteWorker } from "../migration/worker.js";
import { detectUniverfileSQLiteFormat } from "./detect.js";

completeUniverfileSQLiteWorker(detectUniverfileSQLiteFormat);
