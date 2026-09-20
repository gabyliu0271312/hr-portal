<template>
  <Teleport to="body">
    <div v-if="open" class="assessment-layer">
      <aside ref="drawerRef" class="assessment-drawer" role="dialog" aria-modal="true" aria-labelledby="assessment-drawer-title" tabindex="-1" @keydown="onDrawerKeydown">
        <header class="drawer-header">
          <h2 id="assessment-drawer-title">选择评估内容</h2>
          <button class="icon-button" type="button" aria-label="关闭选择评估内容" @click="closeDrawer"><Close /></button>
        </header>
        <main class="drawer-body">
          <section class="visibility-row">
            <div>
              <div class="visibility-title"><strong>评估内容分人群可见</strong><PerformanceSwitch v-model="groupVisible" aria-label="评估内容分人群可见" /></div>
              <p>分组后，可根据不同人群评估要求，设置对应的评估内容</p>
            </div>
            <button v-if="groupVisible" class="button button--secondary" type="button">设置分组</button>
          </section>
          <div class="divider" />

          <template v-if="drawerContents.length">
            <div class="drawer-actions">
              <CreateMenu ref="createMenuRef" :allowed-types="props.allowedTypes" @select="openModal" />
              <button class="plain-button expand-all-button" type="button" :aria-expanded="allExpanded" @click="toggleAllExpanded"><ArrowDown v-if="!allExpanded" /><ArrowUp v-else /> {{ allExpanded ? '全部收起' : '全部展开' }}</button>
            </div>
            <section class="created-list" aria-label="评估内容">
              <h3>评估内容</h3>
              <article v-for="content in drawerContents" :key="content.id" class="created-item">
                <input type="checkbox" :checked="isContentSelected(content.id)" :disabled="isContentSelected(content.id)" :aria-label="content.name" @change="toggleAvailableContent(content)" /><strong>{{ content.name }}</strong>
                <div class="created-item__actions"><PerformanceExpandButton :expanded="expandedIds.has(content.id)" :label="`${expandedIds.has(content.id) ? '收起' : '展开'}${content.name}`" @toggle="toggleExpanded(content.id)" />
                  <button class="created-item__edit" type="button" :aria-label="`缂栬緫${content.name}`" @click="editCreated(content)"><Edit /></button>
                </div>
                <div v-if="expandedIds.has(content.id)" class="created-item__details"><div v-for="item in content.items" :key="item.id" class="created-item__detail">{{ item.label }}</div></div>
              </article>
            </section>
          </template>
          <section v-else class="empty-state" aria-label="评估内容列表">
            <el-empty :image-size="112" description="暂无内容" />
            <CreateMenu ref="createMenuRef" :allowed-types="props.allowedTypes" @select="openModal" />
          </section>
        </main>
        <footer v-if="drawerContents.length" class="drawer-footer">
          <button class="button button--primary" type="button" @click="finishDrawer">确定</button>
          <button class="button button--secondary" type="button" @click="closeDrawer">取消</button>
        </footer>
      </aside>
    </div>

    <PerformanceAssessmentEditorModal
      :open="!!activeType"
      :type="activeType || 'work_summary'"
      :label="activeLabel"
      :mode="editingCreatedId ? 'edit' : 'create'"
      :sorting="draggedIndex!==null"
      :chrome="false"
      @close="closeModal"
      @confirm="confirmContent"
      @keydown="onModalKeydown"
    >
        <header class="modal-header"><h2 :id="`${activeType}-title`">新建{{ activeLabel }}</h2><button ref="modalCloseRef" class="icon-button" type="button" :aria-label="`关闭新建${activeLabel}`" @click="closeModal"><Close /></button></header>
        <div class="modal-body">
          <div class="config-pane">
            <PerformanceFormField v-model="draft.name" label="名称" required placeholder="请输入名称" :invalid="submitted && !draft.name.trim()" />
            <PerformanceFormField v-model="draft.description" label="描述" textarea placeholder="请输入描述" />
            <h3 class="section-title">配置详情</h3>
            <template v-if="activeType === 'work_summary'">
              <PerformanceRepeatableFillItemList :items="workSummaryItems" :invalid="submitted" @add="addWorkSummaryItem" @remove="removeWorkSummaryItem" @reorder="reorderWorkSummary" @drag-start="startSummarySort" @drag-end="finishSummarySort" @drag-cancel="cancelSummarySort" />
            </template>

            <template v-else-if="activeType === 'custom'">
              <PerformanceRepeatableFillItemList v-model:items="items" :invalid="submitted" show-question-type :tag-options="tagOptions" @add="addCustomFillItem" @remove="removeCustomItem" @reorder="reorderCustomItems" @drag-start="startCustomSort" @drag-end="finishCustomSort" @drag-cancel="cancelCustomSort" />
            </template>

            <div v-else class="config-box">
              <div class="config-box__heading">评估项</div>
              <PerformanceAssessmentSelect class="inside-select" label="评估项" required placeholder="请选择" :options="ratingOptions" :model-value="draft.ratingOptionId" :invalid="submitted && !selectedRating && !items.length" empty-text="暂无评估项" @update:model-value="selectRatingOption" />
            </div>
            <div v-if="activeType==='rating'" class="add-area"><button class="add-button" type="button" @click="addItem"><Plus /> 添加</button></div>
          </div>

          <div class="preview-pane">
            <span class="preview-label">预览</span>
            <h3 class="preview-name">{{ draft.name.trim() || '未命名名称' }}</h3>
            <p v-if="draft.description" class="preview-description">{{ draft.description }}</p>
            <div v-if="activeType==='rating' && selectedRating" class="rating-preview">
              <strong>{{ selectedRating.label }}</strong>
              <PerformanceRatingControl :options="ratingPreviewOptions" :display-mode="selectedRating.displayMode" :interactive="false" :aria-label="`${selectedRating.displayMode || '标签样式'}预览`" />
            </div>
            <template v-else-if="activeType==='custom'">
              <div v-for="item in items" :key="`preview-${item.id}`">
                <div v-if="item.questionType==='tag' && tagOptionFor(item)" class="tag-preview">
                  <strong>{{ tagOptionFor(item)?.label }}</strong><p>{{ tagOptionFor(item)?.description }}</p>
                  <div class="tag-checks"><PerformanceCheckbox v-for="field in tagOptionFor(item)?.defaultFields || []" :key="field.label" :model-value="tagSelectionFor(item).includes(field.label)" :label="field.label" @update:model-value="togglePreviewTag(item, field.label, $event)" /></div>
                  <div class="tag-preview__editor" aria-label="标签填写区域">
                    <div class="tag-preview__selected-groups" aria-label="已选择标签及填写提示">
                      <div v-for="field in selectedTagFields(item)" :key="field.label" class="tag-preview__selected-group">
                        <div class="tag-preview__selected">
                          <span class="tag-preview__selected-tag">
                            <span>{{ field.label }}</span>
                            <button type="button" :aria-label="`删除${field.label}`" @click="removePreviewTag(item, field.label)">×</button>
                          </span>
                        </div>
                        <div class="tag-preview__prompt">{{ field.content }}</div>
                      </div>
                    </div>
                    <div v-if="!selectedTagFields(item).length" class="tag-preview__hint">勾选标签后填写</div>
                  </div>
                </div>
                <div v-else class="text-preview"><strong>{{ item.label.trim() || '未命名填写题' }}</strong><RichTextBox v-model="item.richText" :placeholder="item.hint || '请输入内容'" /></div>
              </div>
            </template>
            <template v-else-if="activeType==='work_summary'">
              <div v-for="item in workSummaryItems" :key="`preview-${item.id}`" class="text-preview"><strong>{{ item.label.trim() || '未命名填写题' }}</strong><RichTextBox :key="`editor-${item.id}`" v-model="item.richText" :placeholder="item.hint || '请输入内容'" /></div>
            </template>
            <div v-else-if="activeType!=='rating'" class="text-preview"><strong>{{ draft.itemName.trim() || '未命名填写题' }}</strong><RichTextBox v-model="draft.richText" :placeholder="draft.hint || '请输入内容'" /></div>
          </div>
        </div>
        <footer class="modal-footer"><button class="button button--secondary" type="button" @click="closeModal">取消</button><button class="button button--primary" type="button" @click="confirmContent">确定</button></footer>
    </PerformanceAssessmentEditorModal>
    <Transition name="toast"><div v-if="success" class="success-toast" role="status"><CircleCheckFilled /> 新建成功</div></Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, Teleport, watch, type Ref } from 'vue'
import PerformanceRichTextBox from './PerformanceRichTextBox.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import PerformanceAssessmentRichTextField from './PerformanceAssessmentRichTextField.vue'
import { ArrowDown, ArrowUp, CircleCheckFilled, Close, Delete, Edit, Plus } from '@element-plus/icons-vue'
import { ElEmpty } from 'element-plus'
import PerformanceAssessmentEditorModal from './PerformanceAssessmentEditorModal.vue'
import PerformanceExpandButton from './PerformanceExpandButton.vue'
import PerformanceRepeatableFillItemList from './PerformanceRepeatableFillItemList.vue'
import PerformanceFormField from './PerformanceFormField.vue'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

export type AssessmentContentType = 'work_summary' | 'rating' | 'custom'
export interface AssessmentOption { id:string; label:string; description?:string; disabled?:boolean; disabledReason?:string; levels?:string[]; levelOptions?:Array<{id:string;label:string;color?:string}>; displayMode?:'标签样式'|'下拉样式' }
export interface AssessmentTagField { label:string; content:string }
export interface AssessmentTagOption extends AssessmentOption { defaultFields?:AssessmentTagField[] }
export interface AssessmentContentDraft { type:AssessmentContentType; name:string; description:string; items:Array<{id:string;label:string;hint:string;richText?:string;questionType?:'text'|'tag';tagOptionId?:string;defaultAll?:boolean;settings?:{mode?:'fill'|'hidden';required?:boolean;hideDescription?:boolean;allowMultiple?:boolean};options?:Array<{id:string;label:string;placeholder?:string;color?:string}>}>; id?:string; content_id?:string; content_slot?:'fill'|'reference'|'adjustment'|'view'; settings?:{hideDescription?:boolean;allowMultiple?:boolean;mode?:string;required?:boolean}; ratingOptionId?:string; ratingDisplayMode?:'标签样式'|'下拉样式'; questionType?:'text'|'tag'; tagOptionId?:string; defaultAll?:boolean; options?:Array<{id:string;label:string;placeholder?:string;color?:string}> }
interface WorkSummaryItem { id:string; label:string; hint:string; richText:string }
interface FillItem { id:string; label:string; hint:string; richText?:string; questionType?:'text'|'tag'; tagOptionId?:string; defaultAll?:boolean; options?:Array<{id:string;label:string;placeholder?:string;color?:string}> }

const props=withDefaults(defineProps<{open:boolean;ratingOptions?:AssessmentOption[];tagOptions?:AssessmentTagOption[];initialContents?:Array<AssessmentContentDraft&{id:string}>;availableContents?:Array<AssessmentContentDraft&{id:string}>;allowedTypes?:AssessmentContentType[]}>(),{ratingOptions:()=>[],tagOptions:()=>[],initialContents:()=>[],availableContents:()=>[],allowedTypes:()=>['work_summary','rating','custom']})
const emit=defineEmits<{'update:open':[boolean];confirm:[AssessmentContentDraft[]]}>()
const drawerRef=ref<HTMLElement|null>(null), modalRef=ref<HTMLElement|null>(null), modalCloseRef=ref<HTMLButtonElement|null>(null), createMenuRef=ref<{focus:()=>void}|null>(null)
const groupVisible=ref(true), activeType=ref<AssessmentContentType|null>(null), submitted=ref(false), itemSubmitted=ref(false), success=ref(false), draggedIndex=ref<number|null>(null), dragAnnouncement=ref(''), editingCreatedId=ref<string|null>(null), expandedIds=ref<Set<string>>(new Set())
const items=ref<FillItem[]>([]), created=ref<Array<AssessmentContentDraft&{id:string}>>([])
const tagSelections=ref<Record<string,string[]>>({})
const previousDefaultAll=ref<Record<string,boolean>>({})
const previousTagOption=ref<Record<string,string>>({})
const drawerContents=computed(()=>{
  const byId=new Map<string, AssessmentContentDraft&{id:string}>()
  props.availableContents.forEach(content=>{
    const id=content.content_id||content.id
    if(id)byId.set(id,{ ...content,id,content_id:id })
  })
  created.value.forEach(content=>{
    const id=content.content_id||content.id
    if(id)byId.set(id,{ ...content,id,content_id:id })
  })
  return [...byId.values()]
})
const workSummaryItems=ref<WorkSummaryItem[]>([])
const draft=reactive({name:'',description:'',itemName:'',hint:'',richText:'',ratingOptionId:'',questionType:'text' as 'text'|'tag',tagOptionId:'',defaultAll:false})
let idCounter=0,contentCounter=0,successTimer:ReturnType<typeof setTimeout>|null=null
const nextId=()=>`assessment-content-${++idCounter}`
const nextContentId=()=>`content-${Date.now()}-${++contentCounter}`
const activeLabel=computed(()=>({work_summary:'工作总结',rating:'评分评级',custom:'自定义'} as const)[activeType.value!]||'')
const selectedRating=computed(()=>props.ratingOptions.find(item=>item.id===draft.ratingOptionId)||null)
const selectedTag=computed(()=>props.tagOptions.find(item=>item.id===draft.tagOptionId)||null)
const ratingPreviewOptions=computed(()=> selectedRating.value?.levelOptions || (selectedRating.value?.levels || []).map((level,index)=>({id:`rating-preview-${index}`,label:level})))
const tagOptionFor=(item:FillItem)=>props.tagOptions.find(option=>option.id===item.tagOptionId)||null
const tagSelectionFor=(item:FillItem)=>tagSelections.value[item.id] || []
const selectedTagFields=(item:FillItem)=>{
  const option=tagOptionFor(item)
  if(!option)return []
  const selected=tagSelectionFor(item)
  return (option.defaultFields || []).filter(field=>selected.includes(field.label))
}
function syncTagSelections(){
  const next={...tagSelections.value}
  items.value.forEach(item=>{
    if(item.questionType!=='tag')return
    const fields=tagOptionFor(item)?.defaultFields || []
    const wasDefaultAll=previousDefaultAll.value[item.id] === true
    const previousOption=previousTagOption.value[item.id]
    const optionChanged=previousOption !== undefined && previousOption !== item.tagOptionId
    if(optionChanged)next[item.id]=item.defaultAll ? fields.map(field=>field.label) : []
    else if(!Object.prototype.hasOwnProperty.call(next,item.id))next[item.id]=item.defaultAll ? fields.map(field=>field.label) : []
    else if(item.defaultAll === true && !wasDefaultAll)next[item.id]=fields.map(field=>field.label)
    else next[item.id]=next[item.id].filter(label=>fields.some(field=>field.label===label))
    previousDefaultAll.value[item.id]=item.defaultAll === true
    previousTagOption.value[item.id]=item.tagOptionId || ''
  })
  tagSelections.value=next
}
function togglePreviewTag(item:FillItem,label:string,checked:boolean){
  const current=tagSelectionFor(item).filter(value=>value!==label)
  if(checked)current.push(label)
  tagSelections.value={...tagSelections.value,[item.id]:current}
}
function removePreviewTag(item:FillItem,label:string){
  togglePreviewTag(item,label,false)
}
const allExpanded=computed(()=>created.value.length>0&&expandedIds.value.size===created.value.length)

watch(()=>props.open,open=>{if(open){created.value=props.initialContents.map(content=>{const id=content.content_id||content.id||nextId();return{...content,id,content_id:id,items:content.items.map(item=>({...item}))}});void nextTick(()=>drawerRef.value?.focus())}else activeType.value=null},{ immediate:true })
watch(()=>draft.questionType,()=>{ itemSubmitted.value=false })
watch([items,()=>props.tagOptions],syncTagSelections,{deep:true,immediate:true})
function resetDraft(){Object.assign(draft,{name:'',description:'',itemName:'',hint:'',richText:'',ratingOptionId:'',questionType:'text',tagOptionId:'',defaultAll:false});items.value=[];tagSelections.value={};previousDefaultAll.value={};previousTagOption.value={};workSummaryItems.value=[];submitted.value=false;itemSubmitted.value=false;draggedIndex.value=null;dragAnnouncement.value=''}
function closeDrawer(){activeType.value=null;emit('update:open',false)}
function contentKey(content:AssessmentContentDraft&{id:string}){return content.content_id||content.id}
function isContentSelected(id:string){return created.value.some(content=>contentKey(content)===id)}
function toggleAvailableContent(content:AssessmentContentDraft&{id:string}){
  const id=contentKey(content)
  if(isContentSelected(id))return
  created.value.push({ ...content, id, content_id:id, items: content.items.map(item=>({ ...item })) })
}
function finishDrawer(){emit('confirm',created.value.map(content=>({ ...content, content_id:content.content_id||content.id })));emit('update:open',false)}
function openModal(type:AssessmentContentType, content?:AssessmentContentDraft&{id:string}){
  resetDraft(); editingCreatedId.value=content?.id||null; activeType.value=type
  if(content){
    Object.assign(draft,{name:content.name,description:content.description,ratingOptionId:content.ratingOptionId||(type==='rating'?content.items[0]?.id||'':''),questionType:content.questionType||'text',tagOptionId:content.tagOptionId||'',defaultAll:!!content.defaultAll})
    if(type==='work_summary' || (type==='custom' && content.questionType==='text')) {
      const fillItems=content.items.length?content.items:[{id:nextId(),label:'',hint:'',richText:''}]
      const targetItems=fillItems.map(item=>({id:item.id,label:item.label,hint:item.hint,richText:item.richText||'',questionType:item.questionType||'text',tagOptionId:item.tagOptionId,defaultAll:item.defaultAll,options:item.options}))
      if(type==='work_summary') workSummaryItems.value=targetItems
      else items.value=targetItems
    } else if(type==='custom') {
      const fillItems=content.items.length?content.items:[{id:nextId(),label:'',hint:'',questionType:'tag' as const,tagOptionId:content.tagOptionId,defaultAll:content.defaultAll,options:content.options}]
      items.value=fillItems.map(item=>({id:item.id,label:item.label,hint:item.hint,richText:item.richText||'',questionType:item.questionType||'tag',tagOptionId:item.tagOptionId||content.tagOptionId,defaultAll:item.defaultAll??content.defaultAll,options:item.options||content.options}))
    } else if(type==='rating') items.value=[]
  } else if(type==='work_summary') {
    workSummaryItems.value.push(createWorkSummaryItem())
  } else if(type==='custom') {
    items.value.push(createCustomFillItem())
  }
  void nextTick(()=>modalCloseRef.value?.focus())
}
function closeModal(){activeType.value=null;editingCreatedId.value=null;resetDraft();void nextTick(()=>drawerRef.value?.focus())}
function toggleExpanded(id:string){const next=new Set(expandedIds.value);next.has(id)?next.delete(id):next.add(id);expandedIds.value=next}
function toggleAllExpanded(){expandedIds.value=allExpanded.value?new Set():new Set(created.value.map(item=>item.id))}
function editCreated(content:AssessmentContentDraft&{id:string}){openModal(content.type,content)}
defineExpose({ openEditor: (content: AssessmentContentDraft & { id: string }) => openModal(content.type, content) })
function selectRatingOption(value:string){draft.ratingOptionId=value;items.value=[];submitted.value=false;itemSubmitted.value=false}
function addWorkSummaryItem(){workSummaryItems.value.push(createWorkSummaryItem())}
function createCustomFillItem():FillItem{return{id:nextId(),label:'',hint:'',richText:'',questionType:'text',tagOptionId:'',defaultAll:false}}
function addCustomFillItem(){items.value.push(createCustomFillItem())}
function addItem(){
  if(activeType.value==='rating'){if(!selectedRating.value){itemSubmitted.value=true;return}items.value=[{id:selectedRating.value.id,label:selectedRating.value.label,hint:''}];itemSubmitted.value=false}
}
function createWorkSummaryItem():WorkSummaryItem{return{id:nextId(),label:'',hint:'',richText:''}}
function removeCustomItem(indexOrId:number|string){items.value=typeof indexOrId==='number'?items.value.filter((_,itemIndex)=>itemIndex!==indexOrId):items.value.filter(item=>item.id!==indexOrId);itemSubmitted.value=false}
function removeWorkSummaryItem(index:number){if(activeType.value!=='work_summary'||workSummaryItems.value.length<2)return;workSummaryItems.value.splice(index,1)}
function reorderItems(target:Ref<FillItem[]>,from:number,to:number){
  if(from===to)return
  const next=target.value.slice()
  const [item]=next.splice(from,1)
  if(!item)return
  next.splice(to,0,item)
  target.value=next
}
function reorderWorkSummary(from:number,to:number){reorderItems(workSummaryItems,from,to)}
function reorderCustomItems(from:number,to:number){reorderItems(items,from,to)}
function startSummarySort(index:number){draggedIndex.value=index}
function finishSummarySort(){draggedIndex.value=null}
function cancelSummarySort(){draggedIndex.value=null}
function startCustomSort(index:number){draggedIndex.value=index}
function finishCustomSort(){draggedIndex.value=null}
function cancelCustomSort(){draggedIndex.value=null}
function validItem(){
  if(activeType.value==='rating')return!!selectedRating.value
  if(activeType.value==='work_summary')return workSummaryItems.value.length>0&&workSummaryItems.value.every(item=>!!item.label.trim())
  return items.value.length>0&&items.value.every(item=>item.questionType==='tag'?!!item.tagOptionId:!!item.label.trim())
}
function confirmContent(){
  submitted.value=true;if(!activeType.value||!draft.name.trim()||!validItem())return
  const ratingItem=selectedRating.value?{id:selectedRating.value.id,label:selectedRating.value.label,hint:''}:null
  const finalItems:AssessmentContentDraft['items']=activeType.value==='work_summary'
    ? workSummaryItems.value.map(({id,label,hint,richText})=>({id,label:label.trim(),hint:hint.trim(),richText}))
    : activeType.value==='custom'
      ? items.value.map(({id,label,hint,richText,questionType,tagOptionId,defaultAll,options})=>({id,label:label.trim(),hint:hint.trim(),richText,questionType,tagOptionId,defaultAll,options}))
      : activeType.value==='rating'&&ratingItem?[ratingItem]:[...items.value]
  const existing=editingCreatedId.value?created.value.find(item=>item.id===editingCreatedId.value):undefined
  const ratingLevels=selectedRating.value?.levelOptions||(selectedRating.value?.levels||[]).map((label,index)=>({id:`${selectedRating.value!.id}-${index}`,label}))
  const nextContent={type:activeType.value,name:draft.name.trim(),description:draft.description.trim(),items:finalItems,ratingOptionId:activeType.value==='rating'?selectedRating.value?.id:undefined,ratingDisplayMode:activeType.value==='rating'?(selectedRating.value?.displayMode||'标签样式'):undefined,questionType:undefined,tagOptionId:undefined,defaultAll:undefined,options:activeType.value==='rating'?ratingLevels:undefined}
  if(editingCreatedId.value){const index=created.value.findIndex(item=>item.id===editingCreatedId.value);if(index>=0)created.value[index]={id:editingCreatedId.value,...nextContent}}
  else {const contentId=nextContentId();created.value.push({id:contentId,content_id:contentId,...nextContent})}
  activeType.value=null;editingCreatedId.value=null;resetDraft();success.value=true;if(successTimer)clearTimeout(successTimer);successTimer=setTimeout(()=>success.value=false,2200);void nextTick(()=>drawerRef.value?.focus())
}
function focusables(root:HTMLElement|null){return root?Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')).filter(e=>e.offsetParent!==null||import.meta.env.MODE==='test'):[]}
function trapTab(event:KeyboardEvent,root:HTMLElement|null){const list=focusables(root);if(!list.length)return;const first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
function onDrawerKeydown(event:KeyboardEvent){if(activeType.value)return;if(event.key==='Escape'){event.preventDefault();closeDrawer()}else if(event.key==='Tab')trapTab(event,drawerRef.value)}
function onModalKeydown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();closeModal()}else if(event.key==='Tab'){const active=document.activeElement;const root=event.currentTarget as HTMLElement|null;if(!event.shiftKey&&active?.classList.contains('button--primary')){event.preventDefault();(root?.querySelector<HTMLButtonElement>('.performance-editor-modal__close')||modalCloseRef.value)?.focus();return}trapTab(event,root)}}
onBeforeUnmount(()=>{if(successTimer)clearTimeout(successTimer)})

const CreateMenu=defineComponent({props:{allowedTypes:{type:Array as ()=>AssessmentContentType[],default:()=>['work_summary','rating','custom']}},emits:['select'],setup(p,{emit:e,expose}){const open=ref(false),button=ref<HTMLButtonElement|null>(null);expose({focus:()=>button.value?.focus()});return()=>h('div',{class:'create-anchor'},[h('button',{ref:button,class:'button button--secondary create-button',type:'button','aria-expanded':String(open.value),'aria-haspopup':'menu',onClick:()=>open.value=!open.value},[h(Plus),h('span','新建')]),open.value?h('div',{class:'create-menu',role:'menu'},p.allowedTypes.map(type=>h('button',{type:'button',role:'menuitem',onClick:()=>{open.value=false;e('select',type)}},type==='work_summary'?'工作总结':type==='rating'?'评分评级':'自定义'))):null])}})
const editorIcons:Record<string,string>={
  bold:'M5 2.709C5 2.317 5.317 2 5.709 2h6.734a5.317 5.317 0 0 1 3.686 9.148 5.671 5.671 0 0 1-2.623 10.7H5.71a.709.709 0 0 1-.71-.707V2.71Zm2 7.798h5.443a3.19 3.19 0 0 0 3.19-3.19c0-1.762-1.428-3.317-3.19-3.317H7v6.507Zm0 2.126v7.09h6.507a3.544 3.544 0 0 0 0-7.09H7Z',
  italic:'M14.825 5.077 11.19 18.923h4.052a1.038 1.038 0 1 1 0 2.077H4.954a1.038 1.038 0 1 1 0-2.077h4.053l3.636-13.846H8.591A1.038 1.038 0 1 1 8.59 3h10.287a1.038 1.038 0 0 1 0 2.077h-4.053Z',
  underline:'M7.361 3.052a.99.99 0 0 0-.989-.994.998.998 0 0 0-.999.994v5.765c0 4.205 2.601 7.29 6.627 7.29s6.627-3.085 6.627-7.29V3.052a.996.996 0 0 0-.996-.994.992.992 0 0 0-.992.994v5.765c0 3.003-1.763 5.302-4.639 5.302-2.876 0-4.639-2.299-4.639-5.302V3.052ZM3.054 19.42a.988.988 0 0 0-.994.988 1 1 0 0 0 .994 1h17.892a1 1 0 0 0 .994-1.002.987.987 0 0 0-.994-.986H3.054Z',
  ordered:'M4.577 1.809a.543.543 0 0 0-.819-.469l-.502.296-.004.003-.309.187c-.342.207-.858.519-1.142.701a.573.573 0 0 0-.261.485c0 .482.544.774.948.522.227-.141.465-.287.642-.395v3.478a.723.723 0 1 0 1.447 0V1.81Zm-.899 7.128c-1.233 0-2.056.817-2.056 1.84a.25.25 0 0 0 .25.251h.891a.259.259 0 0 0 .26-.259c0-.32.227-.589.608-.589a.62.62 0 0 1 .428.15.52.52 0 0 1 .16.396c0 .315-.188.579-.538.949l-1.815 1.968a.672.672 0 0 0 .494 1.127h3.003a.63.63 0 0 0 0-1.26H3.744l.933-1.047c.61-.652.99-1.127.99-1.834a1.57 1.57 0 0 0-.563-1.226c-.356-.3-.852-.466-1.426-.466Zm.015 7.429c-1.006 0-1.692.478-1.946 1.178a.541.541 0 0 0 .107.553c.122.137.307.22.503.22a.773.773 0 0 0 .478-.18c.125-.098.23-.222.312-.33.096-.124.257-.224.511-.224.21 0 .37.063.472.152a.46.46 0 0 1 .16.359v.002a.503.503 0 0 1-.165.391.71.71 0 0 1-.483.16h-.14a.606.606 0 1 0 0 1.213h.168c.275 0 .468.074.59.178a.538.538 0 0 1 .186.42.554.554 0 0 1-.185.435c-.122.107-.314.184-.583.184-.32 0-.528-.114-.644-.264a1.776 1.776 0 0 0-.308-.323.766.766 0 0 0-.47-.174.678.678 0 0 0-.504.22.549.549 0 0 0-.114.55c.244.717.926 1.22 2.012 1.22.602 0 1.161-.168 1.575-.478.416-.311.683-.768.676-1.323-.01-.69-.376-1.122-.793-1.332.34-.231.63-.644.621-1.224-.019-.962-.92-1.583-2.036-1.583ZM8 4a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Z',
  unordered:'M3.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 3a1 1 0 0 0 0 2h13a1 1 0 1 0 0-2H9Zm0 8a1 1 0 1 0 0 2h13a1 1 0 1 0 0-2H9Zm-1 9a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm-3-8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  link:'M18.849 2.699a5.037 5.037 0 0 0-7.1.97L8.97 7.372a4.784 4.784 0 0 0 .957 6.699l.972.729a1 1 0 0 0 1.2-1.6l-.972-.73a2.784 2.784 0 0 1-.557-3.898l2.777-3.703a3.037 3.037 0 1 1 4.8 3.72l-1.429 1.786a1 1 0 1 0 1.562 1.25l1.43-1.788a5.037 5.037 0 0 0-.862-7.138ZM5.152 21.301a5.037 5.037 0 0 0 7.1-.97l2.777-3.703a4.784 4.784 0 0 0-.957-6.699L13.1 9.2a1 1 0 0 0-1.2 1.6l.973.73a2.784 2.784 0 0 1 .556 3.898l-2.777 3.703a3.037 3.037 0 1 1-4.8-3.72l1.429-1.786a1 1 0 1 0-1.562-1.25l-1.43 1.787a5.037 5.037 0 0 0 .863 7.14Z'
}
const editorIconNames:Record<string,string>={bold:'BoldOutlined',italic:'ItalicOutlined',underline:'UnderlineOutlined',ordered:'OrderListOutlined',unordered:'DisorderListOutlined',link:'GlobalLinkOutlined'}
const EditorIcon=defineComponent({props:{name:{type:String,required:true}},setup(p){return()=>h('svg',{width:'1em',height:'1em',viewBox:'0 0 24 24',fill:'none','aria-hidden':'true','data-icon':editorIconNames[p.name]||`${p.name[0].toUpperCase()}${p.name.slice(1)}Outlined`},[h('path',{d:editorIcons[p.name],fill:'currentColor'})])}})
type EditorCommand={command:'bold'|'italic'|'underline'|'insertOrderedList'|'insertUnorderedList'|'link';label:string;tooltip:string;markdown?:string}
const RichTextBox=defineComponent({props:{modelValue:{type:String,default:''},placeholder:{type:String,default:'请输入内容'},readonly:Boolean,fields:{type:Array as ()=>AssessmentTagField[],default:()=>[]}},emits:['update:modelValue'],setup(p,{emit:e}){
  const editor=ref<HTMLElement|null>(null),linkOpen=ref(false),url=ref(''),selection=ref<Range|null>(null)
  const active=reactive({bold:false,italic:false,underline:false,insertOrderedList:false,insertUnorderedList:false})
  const pendingMarks=reactive({bold:false,italic:false,underline:false})
  const tooltip=ref<{ title:string; markdown?:string; x:number; y:number }|null>(null)
  const commands:readonly EditorCommand[]=[
    { command:'bold',label:'粗体',tooltip:'粗体(Ctrl+B)',markdown:'Markdown: **文本** 空格' },
    { command:'italic',label:'斜体',tooltip:'斜体(Ctrl+I)',markdown:'Markdown: *文本* 空格' },
    { command:'underline',label:'下划线',tooltip:'下划线(Ctrl+U)',markdown:'Markdown: ~文本~ 空格' },
    { command:'insertOrderedList',label:'有序列表',tooltip:'有序列表(Ctrl+Shift+7)',markdown:'Markdown: 1. 空格' },
    { command:'insertUnorderedList',label:'无序列表',tooltip:'无序列表(Ctrl+Shift+8)',markdown:'Markdown: - 空格' },
    { command:'link',label:'超链接',tooltip:'超链接(Ctrl+K)' },
  ]
  const emptyHtml='<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-enter="true" data-leaf="true">\u200b</span></div>'
  const directList=(block:HTMLElement)=>Array.from(block.children).find(child=>child.tagName==='OL'||child.tagName==='UL') as HTMLOListElement|HTMLUListElement|undefined
  const selectedBlocks=(range:Range)=>{
    if(range.collapsed){
      const start=range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement
      const block=start?.closest('.ace-line')
      return block instanceof HTMLElement&&block.parentElement===editor.value?[block]:[]
    }
    return Array.from(editor.value?.children||[]).filter((node):node is HTMLElement=>{
      if(!(node instanceof HTMLElement)||!node.classList.contains('ace-line'))return false
      try{return range.intersectsNode(node)}catch{return false}
    })
  }
  const selectedTextNodes=(range:Range)=>{
    if(!editor.value)return [] as Text[]
    const nodes:Text[]=[]
    const walker=document.createTreeWalker(editor.value,NodeFilter.SHOW_TEXT)
    let node=walker.nextNode()
    while(node){
      const text=node as Text
      if(text.data.replace(/\u200b/g,'').trim()){
        try{if(range.intersectsNode(text))nodes.push(text)}catch{ /* stale selection */ }
      }
      node=walker.nextNode()
    }
    return nodes
  }
  const hasMark=(node:Text,state:'bold'|'italic'|'underline')=>{
    let element=node.parentElement
    while(element&&editor.value?.contains(element)){
      if(state==='bold'&&(/^(STRONG|B)$/.test(element.tagName)||element.style.fontWeight==='bold'||Number(element.style.fontWeight)>=600))return true
      if(state==='italic'&&(/^(EM|I)$/.test(element.tagName)||element.style.fontStyle==='italic'))return true
      if(state==='underline'&&(element.tagName==='U'||element.classList.contains('underline')||element.style.textDecoration.includes('underline')))return true
      element=element.parentElement
    }
    return false
  }
  const styleState=(range:Range|null)=>{
    if(!range||!editor.value||!editor.value.contains(range.startContainer)||!editor.value.contains(range.endContainer))return
    const textNodes=selectedTextNodes(range)
    const caretText=range.collapsed&&range.startContainer instanceof Text&&range.startContainer.data.replace(/\u200b/g,'').length?range.startContainer:null
    if(caretText){
      pendingMarks.bold=hasMark(caretText,'bold');pendingMarks.italic=hasMark(caretText,'italic');pendingMarks.underline=hasMark(caretText,'underline')
    }
    const isEmptyCaret=range.collapsed&&!caretText
    active.bold=isEmptyCaret?pendingMarks.bold:textNodes.length>0&&textNodes.every(node=>hasMark(node,'bold'))
    active.italic=isEmptyCaret?pendingMarks.italic:textNodes.length>0&&textNodes.every(node=>hasMark(node,'italic'))
    active.underline=isEmptyCaret?pendingMarks.underline:textNodes.length>0&&textNodes.every(node=>hasMark(node,'underline'))
    const blocks=selectedBlocks(range)
    active.insertOrderedList=blocks.length>0&&blocks.every(block=>directList(block)?.tagName==='OL')
    active.insertUnorderedList=blocks.length>0&&blocks.every(block=>directList(block)?.tagName==='UL')
  }
  const rememberSelection=()=>{const current=document.getSelection();if(!current?.rangeCount||!editor.value?.contains(current.anchorNode))return;selection.value=current.getRangeAt(0).cloneRange();styleState(selection.value)}
  const restoreSelection=()=>{if(!selection.value)return;const current=document.getSelection();current?.removeAllRanges();current?.addRange(selection.value)}
  const emitHtml=()=>{if(editor.value)e('update:modelValue',editor.value.innerHTML)}
  const isBlank=()=>!String(p.modelValue||'').replace(/<[^>]*>|​/g,'').trim()
  const selectedFragment=()=>{restoreSelection();const current=document.getSelection();return current?.rangeCount?current.getRangeAt(0):null}
  const restoreBlockSelection=(blocks:HTMLElement[],collapsed:boolean)=>{
    if(!blocks.length)return
    editor.value?.focus({preventScroll:true})
    const range=document.createRange()
    const endLeaf=collapsed?blocks[0].querySelector<HTMLElement>('[data-enter="true"]'):null
    const endText=endLeaf?.firstChild
    if(collapsed&&endText instanceof Text){range.setStart(endText,endText.length);range.collapse(true)}
    else{range.selectNodeContents(blocks[0]);if(collapsed)range.collapse(false);else if(blocks.length>1)range.setEnd(blocks[blocks.length-1],blocks[blocks.length-1].childNodes.length)}
    const current=document.getSelection();current?.removeAllRanges();current?.addRange(range)
    selection.value=range.cloneRange();styleState(range)
  }
  const toggleMark=(tag:'strong'|'em'|'u')=>{
    const range=selectedFragment();if(!range)return
    if(range.collapsed){const state=tag==='strong'?'bold':tag==='em'?'italic':'underline';pendingMarks[state]=!pendingMarks[state];active[state]=pendingMarks[state];editor.value?.focus({preventScroll:true});restoreSelection();return}
    const blocks=selectedBlocks(range),nodes=selectedTextNodes(range),selector=tag==='strong'?'strong,b':tag==='em'?'em,i':'u'
    if(!nodes.length)return
    const state=tag==='strong'?'bold':tag==='em'?'italic':'underline'
    const removeMark=nodes.every(node=>hasMark(node,state))
    if(removeMark){
      nodes.forEach(node=>{
        const wrapper=node.parentElement?.closest(selector)
        if(wrapper&&editor.value?.contains(wrapper)){wrapper.replaceWith(...Array.from(wrapper.childNodes));return}
        const leaf=node.parentElement
        if(!leaf||!editor.value?.contains(leaf))return
        if(state==='bold')leaf.style.removeProperty('font-weight')
        if(state==='italic')leaf.style.removeProperty('font-style')
        if(state==='underline'){leaf.style.removeProperty('text-decoration');leaf.classList.remove('underline')}
        if(!leaf.getAttribute('style'))leaf.removeAttribute('style')
      })
    }else{
      nodes.filter(node=>!hasMark(node,state)).reverse().forEach(node=>{
        let start=node===range.startContainer?range.startOffset:0
        let end=node===range.endContainer?range.endOffset:node.length
        start=Math.max(0,Math.min(start,node.length));end=Math.max(start,Math.min(end,node.length))
        if(end<node.length)node.splitText(end)
        const selected=start>0?node.splitText(start):node
        const wrapper=document.createElement(tag);selected.parentNode?.insertBefore(wrapper,selected);wrapper.appendChild(selected)
      })
    }
    restoreBlockSelection(blocks,false);emitHtml()
  }
  const emptyLeaf=()=>{const leaf=document.createElement('span');leaf.dataset.string='true';leaf.dataset.enter='true';leaf.dataset.leaf='true';leaf.textContent='\u200b';return leaf}
  const ensureEndLeaf=(item:HTMLElement)=>{if(item.querySelector('[data-enter="true"]'))return;const leaf=document.createElement('span');leaf.dataset.string='true';leaf.dataset.enter='true';leaf.dataset.leaf='true';leaf.textContent='\u200b';item.appendChild(leaf)}
  const plainBlock=(source?:HTMLElement)=>{const block=document.createElement('div');block.className='ace-line';block.dataset.node='true';block.dir='auto';if(source)while(source.firstChild)block.appendChild(source.firstChild);if(!block.childNodes.length)block.appendChild(emptyLeaf());return block}
  const blockListWrapper=(type:'OL'|'UL',source?:HTMLElement)=>{
    const list=document.createElement(type.toLowerCase()) as HTMLOListElement|HTMLUListElement
    list.className=type==='OL'?'list-number1 r-list r-list-number':'list-bullet1 r-list r-list-bullet'
    const item=document.createElement('li');if(source)while(source.firstChild)item.appendChild(source.firstChild)
    if(!item.childNodes.length)item.appendChild(emptyLeaf());ensureEndLeaf(item);list.appendChild(item)
    const block=document.createElement('div');block.className='ace-line list-div';block.dataset.node='true';block.dir='auto';block.appendChild(list)
    if(type==='OL')block.classList.add('list-start-number1','ol-id-captured')
    return block
  }
  const renumberOrderedLists=()=>{
    let start=0
    Array.from(editor.value?.children||[]).forEach(node=>{
      if(!(node instanceof HTMLElement))return
      const list=directList(node);if(list?.tagName!=='OL'){start=0;return}
      start+=1;list.setAttribute('start',String(start));list.setAttribute('data-start',String(start))
      const item=list.querySelector(':scope > li');item?.setAttribute('start',String(start));item?.setAttribute('data-start',String(start))
      if(start===1)list.setAttribute('data-origin-start','1');else list.removeAttribute('data-origin-start')
    })
  }
  const toggleList=(type:'OL'|'UL')=>{
    const range=selectedFragment();if(!range)return
    const blocks=selectedBlocks(range);if(!blocks.length)return
    const collapsed=range.collapsed,removeList=blocks.every(block=>directList(block)?.tagName===type)
    const replacements=blocks.map(block=>{
      const list=directList(block),source=(list?.querySelector(':scope > li') as HTMLElement|null)||block
      const replacement=removeList?plainBlock(source):blockListWrapper(type,source)
      block.replaceWith(replacement);return replacement
    })
    renumberOrderedLists();restoreBlockSelection(replacements,collapsed);emitHtml()
  }
  const markStyles=(leaf:HTMLElement)=>{
    if(pendingMarks.bold)leaf.style.fontWeight='bold'
    if(pendingMarks.italic)leaf.style.fontStyle='italic'
    if(pendingMarks.underline){leaf.style.textDecoration='underline';leaf.classList.add('underline')}
  }
  const leafMatchesPending=(leaf:HTMLElement)=>{
    const text=leaf.firstChild
    if(!(text instanceof Text))return false
    return hasMark(text,'bold')===pendingMarks.bold&&hasMark(text,'italic')===pendingMarks.italic&&hasMark(text,'underline')===pendingMarks.underline
  }
  const insertPendingText=(event:InputEvent)=>{
    if(event.inputType!=='insertText'||!event.data)return
    const currentSelection=document.getSelection()
    const range=currentSelection?.rangeCount?currentSelection.getRangeAt(0):null
    if(!range||!range.collapsed||!editor.value?.contains(range.startContainer))return
    const currentElement=range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement
    const currentLeaf=currentElement?.closest('[data-leaf="true"]') as HTMLElement|null
    const hasPendingMark=pendingMarks.bold||pendingMarks.italic||pendingMarks.underline
    if(!hasPendingMark&&!currentLeaf?.dataset.enter)return
    if(currentLeaf&&!currentLeaf.dataset.enter&&leafMatchesPending(currentLeaf))return
    event.preventDefault()
    const leaf=document.createElement('span');leaf.dataset.string='true';leaf.dataset.leaf='true';leaf.textContent=event.data;markStyles(leaf)
    const endLeaf=currentLeaf?.dataset.enter==='true'?currentLeaf:null
    if(endLeaf)endLeaf.before(leaf);else range.insertNode(leaf)
    const nextRange=document.createRange();nextRange.selectNodeContents(leaf);nextRange.collapse(false)
    currentSelection?.removeAllRanges();currentSelection?.addRange(nextRange);selection.value=nextRange.cloneRange()
    emitHtml();styleState(nextRange)
  }
  const showTooltip=(command:EditorCommand,event:MouseEvent|FocusEvent)=>{const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();tooltip.value={title:command.tooltip,markdown:command.markdown,x:rect.left+rect.width/2,y:rect.top-10}}
  const hideTooltip=()=>{tooltip.value=null}
  const applyLink=()=>{const range=selectedFragment();if(!range||!url.value.trim())return;const anchor=document.createElement('a');anchor.href=url.value.trim();anchor.target='_blank';anchor.rel='noreferrer';anchor.appendChild(range.extractContents());range.insertNode(anchor);emitHtml();linkOpen.value=false;editor.value?.focus()}
  const keyHandler=(event:KeyboardEvent)=>{if(event.key==='Enter'){event.preventDefault();const range=selectedFragment();const current=range?selectedBlocks(range)[0]:null;if(!current)return;const list=directList(current);const block=list?blockListWrapper(list.tagName as 'OL'|'UL'):plainBlock();current.after(block);renumberOrderedLists();restoreBlockSelection([block],true);emitHtml()}rememberSelection()}
  const syncStateFromContent=()=>{
    if(!editor.value)return
    const text=Array.from(editor.value.querySelectorAll<HTMLElement>('[data-leaf="true"]')).map(leaf=>leaf.firstChild).find(node=>node instanceof Text&&node.data.replace(/\u200b/g,'').length)
    if(text instanceof Text){pendingMarks.bold=hasMark(text,'bold');pendingMarks.italic=hasMark(text,'italic');pendingMarks.underline=hasMark(text,'underline');active.bold=pendingMarks.bold;active.italic=pendingMarks.italic;active.underline=pendingMarks.underline}
    const blocks=Array.from(editor.value.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&node.classList.contains('ace-line'))
    active.insertOrderedList=blocks.length>0&&blocks.every(block=>directList(block)?.tagName==='OL')
    active.insertUnorderedList=blocks.length>0&&blocks.every(block=>directList(block)?.tagName==='UL')
  }
  onMounted(()=>{if(editor.value){editor.value.innerHTML=p.modelValue||emptyHtml;syncStateFromContent();document.addEventListener('selectionchange',rememberSelection)}})
  onBeforeUnmount(()=>document.removeEventListener('selectionchange',rememberSelection))
  watch(()=>[p.modelValue,p.placeholder],value=>{if(editor.value&&!editor.value.matches(':focus')&&value[0]!==editor.value.innerHTML)editor.value.innerHTML=value[0]||emptyHtml})
  /*
  return()=>h('div',{class:['rich-editor',{'rich-editor--readonly':p.readonly}]},[h('div',{class:'rich-toolbar',role:p.readonly?undefined:'toolbar','aria-label':p.readonly?undefined:'富文本格式'},commands.map(([cmd,label])=>{const isActive=cmd==='link'?linkOpen.value:active[cmd as keyof typeof active];return p.readonly?h('span',{class:'rich-toolbar-icon'},[h(EditorIcon,{name:cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd})]):h('button',{type:'button',class:{active:isActive},title:label,'aria-label':label,'aria-pressed':cmd==='link'?undefined:String(!!isActive),onMousedown:(event:MouseEvent)=>{event.preventDefault();rememberSelection()},onClick:()=>cmd==='link'?(restoreSelection(),linkOpen.value=!linkOpen.value):cmd==='insertOrderedList'?toggleList('OL'):cmd==='insertUnorderedList'?toggleList('UL'):toggleMark(cmd==='bold'?'strong':cmd==='italic'?'em':'u')},[h(EditorIcon,{name:cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd})])}),linkOpen.value?h('div',{class:'link-popover'},[h('input',{value:url.value,placeholder:'请输入链接地址',onInput:(event:Event)=>url.value=(event.target as HTMLInputElement).value}),h('button',{type:'button',onClick:applyLink},'应用')]):null]),p.readonly?h('div',{class:'default-content'},p.fields.map(field=>h('div',[h('span',field.label),h('p',field.content)])):h('div',{ref:editor,class:'rich-input ace-editor',contenteditable:'true','data-slate-editor':'true','data-zone-container':'*','data-placeholder':p.placeholder,spellcheck:'false',onInput:emitHtml,onKeyup:rememberSelection,onMouseup:rememberSelection,onFocus:rememberSelection}))])
  */
  return()=>h('div',{class:['rich-editor-host',{'rich-editor-host--readonly':p.readonly}]},[
    h(PerformanceRichTextBox,{
      class:'next-remix-rich-text-editor',
      readonly:p.readonly,
      active,
      onBeforeCommand:rememberSelection,
      onCommand:(cmd:EditorCommand['command'])=>{
        if(cmd==='link'){restoreSelection();linkOpen.value=!linkOpen.value}
        else if(cmd==='insertOrderedList')toggleList('OL')
        else if(cmd==='insertUnorderedList')toggleList('UL')
        else toggleMark(cmd==='bold'?'strong':cmd==='italic'?'em':'u')
      },
    },{ default:()=>[
    /*
    h('div',{class:['rich-toolbar','next-remix-rich-text-editor-toolbar'],role:p.readonly?undefined:'toolbar','aria-label':p.readonly?undefined:'富文本格式'},commands.map((command)=>{
      const cmd=command.command,label=command.label
      const isActive=cmd==='link'?linkOpen.value:active[cmd as keyof typeof active]
      const iconName=cmd==='insertOrderedList'?'ordered':cmd==='insertUnorderedList'?'unordered':cmd
      const click=()=>cmd==='link'?(restoreSelection(),linkOpen.value=!linkOpen.value):cmd==='insertOrderedList'?toggleList('OL'):cmd==='insertUnorderedList'?toggleList('UL'):toggleMark(cmd==='bold'?'strong':cmd==='italic'?'em':'u')
      const pluginKey=cmd==='link'?'hyperlink':cmd
      return p.readonly?h('span',{class:'rich-toolbar-icon'},[h(EditorIcon,{name:iconName})]):h('button',{type:'button',class:{active:isActive},'plugin-key':pluginKey,'plugin-disabled':'false','aria-label':label,'aria-pressed':cmd==='link'?undefined:String(!!isActive),onMousedown:(event:MouseEvent)=>{event.preventDefault();rememberSelection()},onMouseenter:(event:MouseEvent)=>showTooltip(command,event),onMouseleave:hideTooltip,onFocus:(event:FocusEvent)=>showTooltip(command,event),onBlur:hideTooltip,onClick:click},[h(EditorIcon,{name:iconName})])
    })),
    */
    linkOpen.value?h('div',{class:'link-popover'},[h('input',{value:url.value,placeholder:'请输入链接地址',onInput:(event:Event)=>url.value=(event.target as HTMLInputElement).value}),h('button',{type:'button',onClick:applyLink},'应用')]):null,
    p.readonly?h('div',{class:'default-content'},p.fields.map(field=>h('div',[h('span',field.label),h('p',field.content)]))):h('div',{class:'next-remix-rich-text-editor-content'},[isBlank()?h('span',{class:'rich-placeholder'},p.placeholder):null,h('div',{ref:editor,class:'rich-input ace-editor zone-container editor-kit-container next-remix-rich-text-editor-textarea notranslate chrome window chrome88',contenteditable:'true','data-zone-id':'0','data-zone-container':'*','data-slate-editor':'true','data-placeholder':p.placeholder,spellcheck:'false',onBeforeinput:insertPendingText,onInput:emitHtml,onKeydown:keyHandler,onKeyup:rememberSelection,onMouseup:rememberSelection,onFocus:rememberSelection})]),
    ]}),
  ])
}})
</script>

<style scoped>
.assessment-layer,.modal-layer{width:100vw;height:100vh}
.modal-slot { display: contents; }
.modal-slot > .modal-header, .modal-slot > .modal-footer { display: none; }
.assessment-layer,.modal-layer{position:fixed;inset:0;z-index:2100;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}.assessment-layer{pointer-events:none}.assessment-drawer{position:absolute;inset:0 0 0 auto;display:flex;flex-direction:column;width:680px;background:#fff;box-shadow:-8px 0 24px rgba(31,35,41,.12);outline:0;pointer-events:auto}.drawer-header,.modal-header{display:flex;align-items:center;justify-content:space-between;height:58px;min-height:58px;padding:0 20px;border-bottom:1px solid #dee0e3;box-sizing:border-box}.drawer-header h2,.modal-header h2{margin:0;font-size:18px;font-weight:600;line-height:26px}.icon-button{display:grid;place-items:center;width:32px;height:32px;padding:7px;border:0;border-radius:6px;background:transparent;color:#646a73;cursor:pointer}.icon-button:hover,.icon-button:focus-visible{background:#eff0f1;outline:0}.icon-button svg{width:18px}.drawer-body{position:relative;flex:1;min-height:0;overflow:auto;padding:20px;box-sizing:border-box}.visibility-row{display:flex;justify-content:space-between}.visibility-title{display:flex;align-items:center;gap:8px}.visibility-row p{margin:0;color:#646a73}.toggle{position:relative;width:28px;height:16px;padding:0;border:0;border-radius:8px;background:#bbbfc4;cursor:pointer}.toggle span{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}.toggle--on{background:#1456f0}.toggle--on span{left:14px}.divider{height:1px;margin-top:20px;background:#dee0e3}.button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:4px 16px;border-radius:6px;box-sizing:border-box;font:inherit;cursor:pointer}.button--secondary{border:1px solid #d0d3d6;background:#fff;color:#1f2329}.button--secondary:hover,.button--secondary:focus-visible{border-color:#3370ff;color:#245bdb;outline:0}.button--primary{border:1px solid #3370ff;background:#3370ff;color:#fff}.empty-state{position:absolute;inset:142px 20px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center}.empty-state :deep(.el-empty){padding:0}.empty-state :deep(.el-empty__description){margin-top:10px}.create-anchor{position:relative;display:inline-flex}.create-button{gap:4px;min-width:80px;margin-top:16px;color:#245bdb;border-color:#3370ff}.create-button svg{width:14px}.create-menu{position:absolute;z-index:5;top:52px;left:0;display:flex;flex-direction:column;min-width:96px;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.create-menu button{height:32px;padding:5px 12px;border:0;background:#fff;text-align:left;font:inherit;cursor:pointer}.create-menu button:hover{background:#eff0f1}.drawer-actions{display:flex;align-items:center;justify-content:space-between}.drawer-actions .create-button{margin-top:20px}.plain-button{margin-top:20px;border:0;background:transparent;font:inherit;cursor:pointer}.created-list{margin-top:16px}.created-list h3{margin:0 0 12px;font-size:14px}.created-item{display:grid;grid-template-columns:16px 1fr 16px;align-items:center;gap:16px;height:48px;padding:0 16px;border:1px solid #dee0e3;border-radius:8px}.created-item input{width:16px;height:16px;accent-color:#1456f0}.created-item svg{width:16px;color:#646a73}.drawer-footer{display:flex;gap:12px;height:64px;padding:16px 20px;border-top:1px solid #dee0e3;box-sizing:border-box}.modal-layer{z-index:2200;display:flex;align-items:center;justify-content:center;padding:32px 180px;box-sizing:border-box;background:rgba(31,35,41,.55)}.content-modal{display:flex;flex-direction:column;width:min(1080px,calc(100vw - 360px));max-height:calc(100vh - 64px);overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 12px 32px rgba(31,35,41,.2)}.content-modal--work_summary{height:650px}.content-modal--rating{height:559px}.content-modal--custom{height:722px}.modal-header{height:72px;min-height:72px;padding:0 24px}.modal-body{display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0}.config-pane,.preview-pane{min-width:0;overflow:auto;padding:10px 24px 12px;box-sizing:border-box}.config-pane{border-right:1px solid #dee0e3}.form-field{display:block;margin-bottom:18px}.field-label{display:block;margin-bottom:6px;font-weight:600}.field-label i,.type-field i{margin-left:2px;color:#f54a45;font-style:normal}.form-field input,.form-field textarea{display:block;width:100%;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit;outline:0}.form-field textarea{resize:vertical}.form-field input:focus,.form-field textarea:focus{border-color:#3370ff}.invalid,.select-shell.invalid{border-color:#f54a45!important}.field-error{display:block;margin-top:2px;color:#f54a45;font-size:13px}.section-title{margin:2px 0 8px;font-size:14px}.config-box{border:1px solid #dee0e3;border-radius:6px}.config-box__heading{height:42px;padding:10px 20px;box-sizing:border-box;background:#f5f6f7;color:#646a73}.form-field--inside,.inside-select{display:block;margin:18px 20px}.saved-item{display:grid;grid-template-columns:18px 1fr 24px;align-items:center;gap:8px;min-height:42px;padding:8px 12px;border-bottom:1px solid #eff0f1}.drag-handle{width:16px;color:#8f959e;cursor:grab}.saved-item button{display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e}.saved-item button svg{width:14px}.type-field{margin:18px 20px 16px;padding:0;border:0}.type-field legend{margin-bottom:8px;font-weight:600}.type-field label{margin-right:20px}.type-field input{width:16px;height:16px;margin:0 4px 0 0;vertical-align:-3px;accent-color:#1456f0}.option-field{display:block}.select-shell{position:relative;border:1px solid #d0d3d6;border-radius:6px}.select-shell.open{border-color:#3370ff}.select-shell>button{display:flex;align-items:center;justify-content:space-between;width:100%;height:30px;padding:4px 11px;border:0;border-radius:6px;background:#fff;font:inherit;text-align:left}.select-shell>button svg{width:14px}.placeholder{color:#8f959e}.option-menu{position:absolute;z-index:10;top:36px;right:-1px;left:-1px;max-height:220px;overflow:auto;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.option-menu>button{position:relative;display:flex;flex-direction:column;width:100%;min-height:44px;padding:6px 12px;border:0;background:#fff;text-align:left;font:inherit}.option-menu>button:hover:not(:disabled){background:#eff0f1}.option-menu>button:disabled{color:#8f959e}.option-menu small{color:#8f959e}.option-menu em{position:absolute;right:10px;top:6px;font-size:12px;font-style:normal}.option-empty{padding:10px;color:#8f959e;text-align:center}.default-all{display:flex;align-items:center;gap:8px;margin:0 20px 18px}.add-button{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;height:46px;margin-top:8px;border:0;background:#f5f6f7;color:#245bdb;font:inherit}.add-button svg{width:14px}.custom-added-items{display:flex;flex-direction:column;gap:8px;margin-top:8px}.custom-added-item{display:block;overflow:hidden}.custom-added-item .config-box__heading{display:flex;align-items:center;justify-content:space-between}.custom-added-item__name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.custom-added-item button{display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e;cursor:pointer}.custom-added-item button:hover,.custom-added-item button:focus-visible{color:#f54a45;background:#fff1f0;outline:0}.custom-added-item button svg{width:14px}.custom-added-item__tag-label{margin:18px 20px 8px;font-weight:600}.custom-added-item__options{display:flex;flex-wrap:wrap;gap:8px;margin:0 20px 18px}.custom-added-item__options span{padding:2px 8px;border-radius:4px;background:#f5f6f7;color:#646a73}.preview-label{display:inline-block;margin-left:-18px;padding:0 4px;background:#eff0f1;font-weight:600}.preview-name{position:relative;margin:26px 0 0;padding-left:10px;font-size:18px}.preview-name:before{position:absolute;top:2px;bottom:2px;left:0;width:2px;background:#3370ff;content:''}.preview-description{margin:2px 0 18px;color:#646a73}.text-preview>strong,.rating-preview>strong,.tag-preview>strong{display:block;margin:16px 0 8px}.rich-editor{position:relative;min-height:130px;border:1px solid #d0d3d6;border-radius:6px}.rich-toolbar{display:flex;align-items:center;gap:2px;height:36px;padding:4px 6px;box-sizing:border-box}.rich-toolbar button,.rich-toolbar span{display:grid;place-items:center;width:28px;height:28px;padding:4px;border:0;border-radius:4px;background:transparent;color:#646a73;font:italic 16px/20px Georgia,serif}.rich-toolbar button:first-child{font-style:normal;font-weight:700}.rich-toolbar button:nth-child(3){text-decoration:underline}.rich-toolbar button:hover,.rich-toolbar button.active{background:#eff0f1;color:#1456f0}.rich-toolbar svg{width:15px}.rich-input{min-height:90px;padding:6px 10px;box-sizing:border-box;outline:0}.link-popover{position:absolute;z-index:5;top:38px;left:128px;display:flex;gap:6px;width:260px;padding:8px;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.link-popover input{flex:1;min-width:0}.rating-preview :deep(.performance-option-navigator){margin:16px 0 0 15px}.rating-select-preview{display:flex;align-items:center;justify-content:space-between;width:336px;height:32px;margin:16px 0 0 15px;padding:4px 12px;box-sizing:border-box;border-radius:6px;background:#f5f6f7;color:#8f959e;font-size:14px;line-height:22px}.rating-select-preview__arrow{display:block;flex:0 0 12px;width:12px;height:12px;color:#646a73;overflow:hidden}.tag-preview p{margin:0 0 8px;color:#646a73}.tag-checks{display:flex;gap:24px;margin-bottom:10px}.tag-checks input{accent-color:#1456f0}.rich-editor--readonly{min-height:180px}.default-content{padding:0 10px}.default-content span{display:inline-block;padding:2px 6px;border-radius:3px;background:#e1eaff;color:#1456f0}.default-content p{padding:6px 0;border-bottom:1px dashed #d0d3d6}.modal-footer{display:flex;justify-content:flex-end;gap:12px;height:81px;min-height:81px;padding:24px;box-sizing:border-box;border-top:1px solid #dee0e3}.success-toast{position:fixed;z-index:2300;top:40px;left:50%;display:flex;align-items:center;gap:8px;height:54px;padding:0 20px;border:1px solid #34c759;border-radius:8px;background:#f0fff4;box-shadow:0 8px 24px rgba(31,35,41,.14);transform:translateX(-50%);font-weight:600}.success-toast svg{width:16px;color:#34a853}.toast-enter-active,.toast-leave-active{transition:opacity .15s,transform .15s}.toast-enter-from,.toast-leave-to{opacity:0;transform:translate(-50%,-8px)}
@media(max-width:1440px){.content-modal{width:calc(100vw - 360px);height:calc(100vh - 64px)}}
.expand-all-button{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px}
.expand-all-button:hover,.expand-all-button:focus-visible{background:#eff0f1;outline:0}
.expand-all-button svg{width:16px}
.created-item{position:relative;grid-template-columns:16px 1fr auto;min-height:48px;height:auto}
.created-item input{accent-color:#8f959e;opacity:.65}.created-item input:disabled{pointer-events:none}
.created-item__actions{display:flex;align-items:center;gap:2px}
.created-item__actions button{display:grid;place-items:center;width:28px;height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:#646a73;cursor:pointer}
.created-item__actions button:hover,.created-item__actions button:focus-visible{background:#eff0f1;color:#3370ff;outline:0}
.created-item__actions svg{width:16px}
.created-item__details{grid-column:2 / -1;padding:0 0 12px;color:#646a73}
.created-item__detail{padding:4px 0}
</style>

<style>
.modal-layer .rich-toolbar button,
.modal-layer .rich-toolbar span {
  width: 24px;
  height: 24px;
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  color: #646a73;
  font: inherit;
  cursor: pointer;
}
.modal-layer .rich-toolbar button:hover {
  background: rgba(31, 35, 41, 0.1);
  color: #646a73;
}
.modal-layer .rich-toolbar button.active {
  background: rgba(51, 112, 255, 0.1);
  color: #3370ff;
}
.modal-layer .rich-toolbar button:focus-visible {
  outline: 2px solid rgba(51, 112, 255, 0.35);
  outline-offset: 1px;
}
.modal-layer .rich-toolbar svg {
  width: 16px;
  height: 16px;
}
.modal-layer .rich-input {
  font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.modal-layer .rich-input .ace-line {
  min-height: 22px;
  margin: 0;
}
.modal-layer .rich-input .ace-line.list-div {
  min-height: 22px;
}
.modal-layer .rich-input ol,
.modal-layer .rich-input ul {
  margin: 0;
  padding-left: 24px;
}
.modal-layer .rich-input ol.list-number1 { list-style-type: decimal; }
.modal-layer .rich-input ul.list-bullet1 { list-style-type: disc; }
</style>

<style>
.assessment-layer .create-anchor{position:relative;display:inline-flex}
.assessment-layer .create-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:80px;height:32px;margin-top:16px;padding:4px 16px;box-sizing:border-box;border:1px solid #3370ff;border-radius:6px;background:#fff;color:#245bdb;font:inherit;cursor:pointer}
.assessment-layer .create-button svg{width:14px}
.assessment-layer .create-menu{position:absolute;z-index:5;top:52px;left:0;display:flex;flex-direction:column;min-width:96px;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}
.assessment-layer .create-menu button{height:32px;padding:5px 12px;border:0;background:#fff;text-align:left;font:inherit;cursor:pointer}
.assessment-layer .create-menu button:hover{background:#eff0f1}
.modal-layer .form-field{display:block;margin-bottom:18px}
.modal-layer .form-field--inside{margin:18px 20px}
.modal-layer .item-card+.item-card{margin-top:0}
.modal-layer .item-card.saved-item{display:block;min-height:0;margin-bottom:8px;padding:0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-sizing:border-box}
.modal-layer .item-card .config-box__heading{display:grid;grid-template-columns:1fr 16px 1fr;align-items:center;width:100%;height:42px;padding:6px 10px;box-sizing:border-box;outline:0}
.modal-layer .item-card__title{justify-self:start;margin-right:8px}
.modal-layer .drag-icon-slot{display:grid;place-items:center;width:16px;height:16px;color:#646a73;transform:rotate(90deg)}
.modal-layer .drag-icon{display:block;width:16px;height:16px}
.modal-layer .item-card__actions{display:flex;justify-self:end;justify-content:flex-end;min-width:24px;margin-left:8px}
.modal-layer .item-card__actions button{display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#646a73;cursor:pointer}
.modal-layer .item-card__actions button:hover{border-radius:4px;background:rgba(31,35,41,.1)}
.modal-layer .item-card__actions svg{width:14px}
.modal-layer .field-label{display:block;margin-bottom:6px;font-weight:600}
.modal-layer .field-label i{margin-left:2px;color:#f54a45;font-style:normal}
.modal-layer .form-field input,.modal-layer .form-field textarea{display:block;width:100%;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit;outline:0}
.modal-layer .form-field textarea{resize:vertical}
.modal-layer .form-field input:focus,.modal-layer .form-field textarea:focus{border-color:#3370ff}
.modal-layer .form-field .invalid,.modal-layer .select-shell.invalid{border-color:#f54a45!important}
.modal-layer .field-error{display:block;margin-top:2px;color:#f54a45;font-size:13px}
.modal-layer .option-field{display:block}
.modal-layer .select-shell{position:relative;border:1px solid #d0d3d6;border-radius:6px}
.modal-layer .select-shell.open{border-color:#3370ff}
.modal-layer .select-shell>button{display:flex;align-items:center;justify-content:space-between;width:100%;height:30px;padding:4px 11px;border:0;border-radius:6px;background:#fff;font:inherit;text-align:left}
.modal-layer .select-shell>button svg{width:14px}
.modal-layer .placeholder{color:#8f959e}
.modal-layer .option-menu{position:absolute;z-index:10;top:36px;right:-1px;left:-1px;max-height:220px;overflow:auto;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}
.modal-layer .option-menu>button{position:relative;display:flex;flex-direction:column;width:100%;min-height:44px;padding:6px 12px;border:0;background:#fff;text-align:left;font:inherit}
.modal-layer .option-menu>button:hover:not(:disabled){background:#eff0f1}
.modal-layer .option-menu>button:disabled{color:#8f959e}
.modal-layer .option-menu small{color:#8f959e}
.modal-layer .option-menu em{position:absolute;right:10px;top:6px;font-size:12px;font-style:normal}
.modal-layer .option-empty{padding:10px;color:#8f959e;text-align:center}
.modal-layer .toggle{position:relative;width:28px;height:16px;padding:0;border:0;border-radius:8px;background:#bbbfc4;cursor:pointer}
.modal-layer .toggle span{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}
.modal-layer .toggle--on{background:#1456f0}
.modal-layer .toggle--on span{left:14px}
.modal-layer .rich-editor{position:relative;min-height:130px;border:1px solid #d0d3d6;border-radius:6px}
.modal-layer .rich-toolbar{display:flex;align-items:center;gap:2px;height:36px;padding:4px 6px;box-sizing:border-box}
.modal-layer .rich-toolbar button,.modal-layer .rich-toolbar span{display:grid;place-items:center;width:28px;height:28px;padding:4px;border:0;border-radius:4px;background:transparent;color:#646a73;font:italic 16px/20px Georgia,serif}
.modal-layer .rich-toolbar button:first-child{font-style:normal;font-weight:700}
.modal-layer .rich-toolbar button:nth-child(3){text-decoration:underline}
.modal-layer .rich-toolbar button:hover,.modal-layer .rich-toolbar button.active{background:#eff0f1;color:#1456f0}
.modal-layer .rich-toolbar svg{width:15px}
.modal-layer .rich-input{min-height:90px;padding:6px 10px;box-sizing:border-box;outline:0}
.modal-layer .modal-layer .link-popover{position:absolute;z-index:5;top:38px;left:128px;display:flex;gap:6px;width:260px;padding:8px;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}
.modal-layer .link-popover input{flex:1;min-width:0;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;font:inherit;outline:0}
.modal-layer .link-popover input:focus{border-color:#3370ff}
.modal-layer .link-popover button{height:32px;padding:4px 12px;border:1px solid #3370ff;border-radius:6px;background:#3370ff;color:#fff;font:inherit;cursor:pointer}
.modal-layer .rich-editor--readonly{min-height:180px}
.modal-layer .default-content{padding:0 10px}
.modal-layer .default-content span{display:inline-block;padding:2px 6px;border-radius:3px;background:#e1eaff;color:#1456f0}
.modal-layer .default-content p{padding:6px 0;border-bottom:1px dashed #d0d3d6}
</style>

<style>
.modal-layer .rich-toolbar button,.modal-layer .rich-toolbar span{width:24px;height:24px;padding:4px;border-radius:4px;background:transparent;color:#646a73;font:inherit;cursor:pointer}
.modal-layer .rich-toolbar button:hover{background:rgba(31,35,41,.1);color:#646a73}
.modal-layer .rich-toolbar button.active{background:rgba(51,112,255,.1);color:#3370ff}
.modal-layer .rich-toolbar button:active{background:rgba(51,112,255,.16);color:#3370ff}
.modal-layer .rich-toolbar button:focus-visible{outline:2px solid rgba(51,112,255,.35);outline-offset:1px}
.modal-layer .rich-toolbar svg{width:16px;height:16px}
.modal-layer .rich-input{font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
.modal-layer .rich-input .ace-line{min-height:22px;margin:0}
.modal-layer .rich-input ol,.modal-layer .rich-input ul{margin:0;padding-left:24px}
.modal-layer .rich-input .r-list{list-style:none}
.modal-layer .rich-input .r-list>li{position:relative;min-height:22px;list-style:none}
.modal-layer .rich-input .r-list-bullet>li::before{position:absolute;top:8px;left:-17px;width:6px;height:6px;border-radius:50%;background:#3370ff;content:''}
.modal-layer .rich-input .r-list-number>li::before{position:absolute;top:0;left:-24px;width:20px;color:#646a73;content:attr(data-start) '.';text-align:right}
.rich-toolbar-tooltip{position:fixed;z-index:5000;pointer-events:none;transform:translate(-50%,-100%);white-space:nowrap}
.rich-toolbar-tooltip .ud__tooltip-content{position:relative;padding:8px 12px;border-radius:6px;background:#1f2329;color:#fff;box-shadow:0 8px 24px 8px rgba(31,35,41,.04),0 6px 12px rgba(31,35,41,.04),0 4px 8px -8px rgba(31,35,41,.06);font:400 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}
.rich-toolbar-tooltip .ud__tooltip-content>div+div{font-size:12px}
.rich-toolbar-tooltip .ud__tooltip-content::after{position:absolute;bottom:-4px;left:50%;width:8px;height:8px;background:#1f2329;content:'';transform:translateX(-50%) rotate(45deg)}
</style>

<style>
.modal-layer .add-button {
  display: flex;
  width: max-content;
  min-width: 0;
  height: 22px;
  margin: 0 auto;
  padding: 2px 4px;
  box-sizing: border-box;
  background: transparent;
  color: #245bdb;
  cursor: pointer;
  transition: background-color .12s ease, color .12s ease;
}
.modal-layer .add-button:hover {
  background: #e1eaff;
  color: #3370ff;
}
.modal-layer .add-button:active {
  background: #d6e2ff;
}
.modal-layer .add-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 46px;
  margin-top: 0;
  border-radius: 4px;
  background: #f5f6f7;
}
.modal-layer .add-button:focus-visible {
  outline: 2px solid rgba(51,112,255,.35);
  outline-offset: 1px;
}
.modal-layer .item-card.is-dragging {
  opacity: .95;
  box-shadow: 0 6px 24px rgba(31,35,41,.08);
}
.modal-layer .work-summary-list { overflow-anchor:none; }
.modal-layer.is-sorting,
.modal-layer.is-sorting * { cursor:grabbing!important; }
.modal-layer.is-sorting [data-rbd-drag-handle-context-id] { pointer-events:none; }
.modal-layer .next-remix-rich-text-editor {
  position: relative;
  min-height: 130px;
  border: 1px solid #d0d3d6;
  border-radius: 6px;
  background: #fff;
}
.modal-layer .next-remix-rich-text-editor:focus-within {
  border-color: #3370ff;
  box-shadow: 0 0 0 2px rgba(51,112,255,.12);
}
.modal-layer .next-remix-rich-text-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 36px;
  padding: 4px 6px;
  box-sizing: border-box;
}
.modal-layer .next-remix-rich-text-editor-content {
  position: relative;
  display: grid;
  min-height: 90px;
  max-height: none;
}
.modal-layer .next-remix-rich-text-editor-content .rich-placeholder {
  position: relative;
  grid-area: 1 / 1;
  align-self: start;
  margin: 6px 8px;
  z-index: 1;
  color: #8f959e;
  font: 400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
  white-space: pre-wrap;
  pointer-events: none;
}
.modal-layer .next-remix-rich-text-editor .zone-container {
  grid-area: 1 / 1;
  min-height: 90px;
  overflow: visible;
  padding: 6px 10px;
  box-sizing: border-box;
  outline: 0;
}
.modal-layer .r-list { margin: 0; padding-left: 24px; list-style: none; }
.drag-instruction {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
.tag-preview {
  width: 100%;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.tag-preview > strong {
  display: block;
  margin: 16px 0 2px;
  color: #1f2329;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}
.tag-preview > p {
  margin: 0 0 8px;
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
.tag-checks {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0 24px;
  min-height: 46px;
  margin: 0 0 12px;
  padding: 4px 12px 12px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #f8f9fa;
}
.tag-checks .performance-checkbox {
  width: max-content !important;
  min-width: max-content;
  flex: 0 0 auto;
  margin-top: 8px;
}
.tag-checks .performance-checkbox__control {
  width: 16px;
  flex: 0 0 16px;
}
.tag-checks .performance-checkbox__label {
  width: auto;
  flex: 0 0 auto;
  white-space: nowrap;
}
.tag-checks .performance-checkbox--disabled {
  color: #1f2329;
}
.tag-checks .performance-checkbox--disabled .ud__checkbox__wallpaper {
  border-color: #8f959e;
  background: #fff;
}
.tag-checks .performance-checkbox--disabled .ud__checkbox__wallpaper--checked {
  border-color: transparent;
  background: #0442d2;
}
.tag-preview__selected-groups {
  display: flex;
  flex: 0 0 100%;
  flex-direction: column;
  gap: 8px;
}
.tag-preview__selected-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.tag-preview__selected {
  display: flex;
  align-items: center;
  min-height: 22px;
  margin: 0 0 4px;
}
.tag-preview__prompt {
  overflow: hidden;
  min-height: 22px;
  color: #8f959e;
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
  word-break: break-word;
}
.tag-preview__selected-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(20, 86, 240, 0.2);
  color: #002270;
  font-size: 14px;
  line-height: 22px;
}
.tag-preview__selected-tag button {
  width: 16px;
  height: 16px;
  margin-left: 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: currentColor;
  font-size: 16px;
  line-height: 14px;
  cursor: pointer;
}
.tag-preview__selected-tag button:hover,
.tag-preview__selected-tag button:focus-visible {
  background: rgba(0, 34, 112, 0.12);
  outline: 0;
}
.tag-preview__editor {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  min-height: 180px;
  padding: 12px 16px;
  box-sizing: border-box;
  border: 1px solid #dee0e3;
  border-radius: 6px;
  background: #fff;
}
.tag-preview__hint {
  width: 100%;
  margin: 0;
  color: #8f959e;
  font-size: 14px;
  line-height: 22px;
}
</style>
