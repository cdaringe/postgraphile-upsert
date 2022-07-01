export type Tags = unknown;
export interface KeyAttribute {
  $ref: string;
}
export interface Constraint {
  kind: string;
  id: string;
  name: string;
  type: string;
  classId: string;
  foreignClassId?: unknown;
  description?: unknown;
  keyAttributeNums: number[];
  foreignKeyAttributeNums?: unknown;
  comment?: unknown;
  tags: Tags;
  class: PgTable; //???
  keyAttributes: KeyAttribute[];
  foreignKeyAttributes: unknown[];
}

export interface Namespace {
  kind: string;
  id: string;
  name: string;
  description: string;
  comment: string;
  tags: Tags;
}

export interface Class {
  $ref: string;
}

export interface PrimaryKeyConstraint {
  $ref: string;
}

export interface Type {
  aclDeletable: boolean;
  aclInsertable: boolean;
  aclSelectable: boolean;
  aclUpdatable: boolean;
  arrayItemTypeId?: unknown;
  attributes: Attribute[];
  canUseAsterisk: boolean;
  category: string;
  class: Class;
  classId: string;
  classKind: string;
  comment?: unknown;
  constraints: Constraint[];
  description?: unknown;
  domainBaseTypeId?: unknown;
  domainHasDefault: boolean;
  domainIsNotNull: boolean;
  domainTypeModifier?: unknown;
  enumVariants?: unknown;
  foreignConstraints: unknown[];
  id: string;
  isDeletable: boolean;
  isExtensionConfigurationTable: boolean;
  isInsertable: boolean;
  isPgArray: boolean;
  isSelectable: boolean;
  isUpdatable: boolean;
  kind: string;
  name: string;
  namespace: Namespace;
  namespaceId: string;
  namespaceName: string;
  primaryKeyConstraint: PrimaryKeyConstraint;
  rangeSubTypeId?: unknown;
  tags: Tags;
  type: string;
  typeId: string;
  typeLength: number;
}

export interface Class2 {
  $ref: string;
}

export interface ArrayItemType {
  $ref: string;
}

export interface ArrayType2 {
  kind: string;
  id: string;
  name: string;
  description?: unknown;
  namespaceId: string;
  namespaceName: string;
  type: string;
  category: string;
  domainIsNotNull: boolean;
  arrayItemTypeId: string;
  typeLength: number;
  isPgArray: boolean;
  classId?: unknown;
  domainBaseTypeId?: unknown;
  domainTypeModifier?: unknown;
  domainHasDefault: boolean;
  enumVariants?: unknown;
  rangeSubTypeId?: unknown;
  comment?: unknown;
  tags: Tags;
  arrayItemType: ArrayItemType;
}

export interface ArrayType {
  kind: string;
  id: string;
  name: string;
  description: string;
  namespaceId: string;
  namespaceName: string;
  type: string;
  category: string;
  domainIsNotNull: boolean;
  arrayItemTypeId: string;
  typeLength: number;
  isPgArray: boolean;
  classId?: unknown;
  domainBaseTypeId?: unknown;
  domainTypeModifier?: unknown;
  domainHasDefault: boolean;
  enumVariants?: unknown;
  rangeSubTypeId?: unknown;
  comment: string;
  tags: Tags;
  arrayItemType: ArrayItemType;
  arrayType: ArrayType2;
}

export interface Type2 {
  kind: string;
  id: string;
  name: string;
  description: string;
  namespaceId: string;
  namespaceName: string;
  type: string;
  category: string;
  domainIsNotNull: boolean;
  arrayItemTypeId?: unknown;
  typeLength: number;
  isPgArray: boolean;
  classId?: unknown;
  domainBaseTypeId?: unknown;
  domainTypeModifier?: unknown;
  domainHasDefault: boolean;
  enumVariants?: unknown;
  rangeSubTypeId?: unknown;
  comment: string;
  tags: Tags;
  arrayType: ArrayType;
  $ref: string;
}

export interface Attribute {
  kind: string;
  classId: string;
  num: number;
  name: string;
  description?: unknown;
  typeId: string;
  typeModifier?: unknown;
  isNotNull: boolean;
  hasDefault: boolean;
  identity: string;
  aclSelectable: boolean;
  aclInsertable: boolean;
  aclUpdatable: boolean;
  columnLevelSelectGrant: boolean;
  comment?: unknown;
  tags: Tags;
  class: Class2;
  type: Type2;
  isIndexed: boolean;
  isUnique: boolean;
}

export interface PgTable {
  aclDeletable: boolean;
  aclInsertable: boolean;
  aclSelectable: boolean;
  aclUpdatable: boolean;
  attributes: Attribute[];
  canUseAsterisk: boolean;
  classKind: string;
  comment?: unknown;
  constraints: Constraint[];
  description?: unknown;
  foreignConstraints: unknown[];
  id: string;
  isDeletable: boolean;
  isExtensionConfigurationTable: boolean;
  isInsertable: boolean;
  isSelectable: boolean;
  isUpdatable: boolean;
  kind: string;
  name: string;
  namespace?: Namespace;
  namespaceId: string;
  namespaceName: string;
  primaryKeyConstraint?: PrimaryKeyConstraint;
  tags: Tags;
  type: Type;
  typeId: string;
}
