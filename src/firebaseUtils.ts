import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  getDoc,
  deleteDoc, 
  writeBatch, 
  getDocFromServer
} from 'firebase/firestore';
import { db } from './firebase';
import { StudentScholarshipRow, ActivityLog, UserRoleMapping } from './types';
import { INITIAL_SCHOLARSHIP_DATA } from './initialData';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on app load
export async function testFirestoreConnection() {
  const testPath = 'classes/connection_test';
  try {
    await getDocFromServer(doc(db, 'classes', 'connection_test'));
    console.log("Firestore connection test passed.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or network status.");
    }
  }
}

// Fetch all students. If none exist in Firestore, return empty list (no auto seeding)
export async function getStudentsFromFirestore(): Promise<StudentScholarshipRow[]> {
  const path = 'classes';
  try {
    const q = collection(db, path);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log("No class records in Firestore.");
      return [];
    }

    const students: StudentScholarshipRow[] = [];
    const seenIds = new Set<string>();
    const seenRegs = new Set<string>();

    snapshot.forEach(docSnap => {
      const classData = docSnap.data();
      if (classData && classData.students) {
        Object.values(classData.students).forEach((student: any) => {
          const row = student as StudentScholarshipRow;
          if (row && row.id && row.regNo) {
            const normalizedReg = row.regNo.trim().toLowerCase();
            if (!seenIds.has(row.id) && !seenRegs.has(normalizedReg)) {
              seenIds.add(row.id);
              seenRegs.add(normalizedReg);
              students.push(row);
            } else {
              console.warn(`Duplicate student ignored during fetch: ID=${row.id}, Reg=${row.regNo}`);
            }
          }
        });
      }
    });
    return students;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Seed helper
async function seedInitialStudents() {
  const path = 'classes';
  try {
    const batch = writeBatch(db);
    // Group INITIAL_SCHOLARSHIP_DATA by region, center, building, class
    const classesMap: Record<string, { region: string; center: string; building: string; class: string; students: Record<string, StudentScholarshipRow> }> = {};
    
    INITIAL_SCHOLARSHIP_DATA.forEach(student => {
      const key = `${student.region}__${student.center}__${student.building}__${student.class}`;
      const docId = key.replace(/[\/\s.#$\[\]]/g, '_');
      if (!classesMap[docId]) {
        classesMap[docId] = {
          region: student.region,
          center: student.center,
          building: student.building,
          class: student.class,
          students: {}
        };
      }
      classesMap[docId].students[student.regNo] = student;
    });

    Object.entries(classesMap).forEach(([docId, classData]) => {
      const docRef = doc(db, 'classes', docId);
      batch.set(docRef, classData);
    });

    await batch.commit();
    console.log("Successfully seeded initial classes data.");
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch logs from Firestore
export async function getLogsFromFirestore(): Promise<ActivityLog[]> {
  const path = 'logs';
  try {
    const q = collection(db, path);
    const snapshot = await getDocs(q);
    const logs: ActivityLog[] = [];
    snapshot.forEach(docSnap => {
      logs.push(docSnap.data() as ActivityLog);
    });
    
    // Sort descending by id (timestamp-based)
    return logs.sort((a, b) => b.id.localeCompare(a.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Add or update student record in Firestore
export async function saveStudentInFirestore(student: StudentScholarshipRow, oldStudent?: StudentScholarshipRow): Promise<void> {
  const key = `${student.region}__${student.center}__${student.building}__${student.class}`;
  const docId = key.replace(/[\/\s.#$\[\]]/g, '_');
  const path = `classes/${docId}`;
  try {
    const batch = writeBatch(db);

    // If student changed details that move them to a different class, or changed registration number, remove old entry
    if (oldStudent) {
      const oldKey = `${oldStudent.region}__${oldStudent.center}__${oldStudent.building}__${oldStudent.class}`;
      const oldDocId = oldKey.replace(/[\/\s.#$\[\]]/g, '_');
      
      if (oldDocId !== docId || oldStudent.regNo !== student.regNo) {
        const oldDocRef = doc(db, 'classes', oldDocId);
        const { deleteField } = await import('firebase/firestore');
        batch.set(oldDocRef, {
          students: {
            [oldStudent.regNo]: deleteField()
          }
        }, { merge: true });
      }
    }

    const docRef = doc(db, 'classes', docId);
    batch.set(docRef, {
      region: student.region,
      center: student.center,
      building: student.building,
      class: student.class,
      students: {
        [student.regNo]: student
      }
    }, { merge: true });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Bulk update multiple students in Firestore
export async function saveBulkStudentsInFirestore(students: StudentScholarshipRow[]): Promise<void> {
  const path = 'classes';
  try {
    const batch = writeBatch(db);
    const classesUpdates: Record<string, { region: string; center: string; building: string; class: string; students: Record<string, StudentScholarshipRow> }> = {};

    students.forEach(student => {
      const key = `${student.region}__${student.center}__${student.building}__${student.class}`;
      const docId = key.replace(/[\/\s.#$\[\]]/g, '_');
      if (!classesUpdates[docId]) {
        classesUpdates[docId] = {
          region: student.region,
          center: student.center,
          building: student.building,
          class: student.class,
          students: {}
        };
      }
      classesUpdates[docId].students[student.regNo] = student;
    });

    Object.entries(classesUpdates).forEach(([docId, classData]) => {
      const docRef = doc(db, 'classes', docId);
      batch.set(docRef, classData, { merge: true });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Add an activity log to Firestore
export async function addLogToFirestore(log: ActivityLog): Promise<void> {
  const path = `logs/${log.id}`;
  try {
    // Sanitize log to remove undefined values that Firestore doesn't support
    const sanitizedLog = Object.fromEntries(
      Object.entries(log).filter(([_, v]) => v !== undefined)
    );
    await setDoc(doc(db, 'logs', log.id), sanitizedLog);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete student in Firestore
export async function deleteStudentInFirestore(student: StudentScholarshipRow): Promise<void> {
  const key = `${student.region}__${student.center}__${student.building}__${student.class}`;
  const docId = key.replace(/[\/\s.#$\[\]]/g, '_');
  const path = `classes/${docId}/${student.regNo}`;
  try {
    const { deleteField } = await import('firebase/firestore');
    const docRef = doc(db, 'classes', docId);
    await setDoc(docRef, {
      students: {
        [student.regNo]: deleteField()
      }
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Reset all students back to initial data in Firestore
export async function resetAllStudentsInFirestore(): Promise<void> {
  const path = 'classes';
  try {
    const snapshot = await getDocs(collection(db, 'classes'));
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    await seedInitialStudents();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Clear all logs in Firestore
export async function clearLogsInFirestore(): Promise<void> {
  const path = 'logs';
  try {
    const snapshot = await getDocs(collection(db, 'logs'));
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch all user roles from Firestore
export async function getUserRolesFromFirestore(): Promise<UserRoleMapping[]> {
  const path = 'settings/role_permissions';
  try {
    const docRef = doc(db, 'settings', 'role_permissions');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data.mappings)) {
        return data.mappings as UserRoleMapping[];
      }
    }
    return [];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Save the entire list of user roles to Firestore in one document write (Highly Cost-Efficient)
export async function saveUserRolesToFirestore(roles: UserRoleMapping[]): Promise<void> {
  const path = 'settings/role_permissions';
  try {
    const docRef = doc(db, 'settings', 'role_permissions');
    await setDoc(docRef, { mappings: roles });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Save or update a single role mapping row
export async function saveUserRoleInFirestore(roleMapping: UserRoleMapping): Promise<void> {
  try {
    const roles = await getUserRolesFromFirestore();
    const index = roles.findIndex(r => 
      r.region.toLowerCase().trim() === roleMapping.region.toLowerCase().trim() &&
      r.center.toLowerCase().trim() === roleMapping.center.toLowerCase().trim() &&
      r.building.toLowerCase().trim() === roleMapping.building.toLowerCase().trim() &&
      r.regno.trim() === roleMapping.regno.trim()
    );
    if (index !== -1) {
      roles[index] = roleMapping;
    } else {
      roles.push(roleMapping);
    }
    await saveUserRolesToFirestore(roles);
  } catch (error) {
    console.error("Failed to save single user role in firestore", error);
  }
}

// Delete a single user role mapping row
export async function deleteUserRoleInFirestore(region: string, center: string, building: string, regno: string): Promise<void> {
  try {
    const roles = await getUserRolesFromFirestore();
    const filtered = roles.filter(r => !(
      r.region.toLowerCase().trim() === region.toLowerCase().trim() &&
      r.center.toLowerCase().trim() === center.toLowerCase().trim() &&
      r.building.toLowerCase().trim() === building.toLowerCase().trim() &&
      r.regno.trim() === regno.trim()
    ));
    await saveUserRolesToFirestore(filtered);
  } catch (error) {
    console.error("Failed to delete user role mapping", error);
  }
}

