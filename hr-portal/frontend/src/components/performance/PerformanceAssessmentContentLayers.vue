<template>
  <Teleport to="body">
    <div v-if="open" class="assessment-layer">
      <aside ref="drawerRef" class="assessment-drawer" role="dialog" aria-modal="true" aria-labelledby="assessment-drawer-title" tabindex="-1" @keydown="onDrawerKeydown">
        <header class="drawer-header">
          <h2 id="assessment-drawer-title">{{ title }}</h2>
          <button class="icon-button" type="button" :aria-label="`关闭${title}`" @click="closeDrawer"><Close /></button>
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
              <PerformanceContentOptionCard v-for="content in drawerContents" :key="content.id" class="created-item" :class="{ 'created-item--unavailable': !canSelectContent(content) }">
                <template #leading>
                  <PerformanceInfoPopover v-if="!canSelectContent(content)" :content="selectionRestriction" variant="disabled-action" width="auto">
                    <PerformanceCheckbox :model-value="isContentSelected(content.id)" :label="content.name" disabled><template #label /></PerformanceCheckbox>
                  </PerformanceInfoPopover>
                  <PerformanceCheckbox v-else :model-value="isContentSelected(content.id)" :label="content.name" :disabled="isContentSelected(content.id)" @update:model-value="toggleAvailableContent(content)"><template #label /></PerformanceCheckbox>
                </template>
                <strong>{{ content.name }}</strong>
                <template #actions>
                  <div class="created-item__actions"><PerformanceExpandButton :expanded="expandedIds.has(content.id)" :label="`${expandedIds.has(content.id) ? '收起' : '展开'}${content.name}`" @toggle="toggleExpanded(content.id)" />
                    <button class="created-item__edit" type="button" :aria-label="`缂栬緫${content.name}`" @click="editCreated(content)"><Edit /></button>
                  </div>
                </template>
                <template #details>
                  <div v-if="expandedIds.has(content.id)" class="created-item__details"><div v-for="item in content.items" :key="item.id" class="created-item__detail">{{ item.label }}</div></div>
                </template>
              </PerformanceContentOptionCard>
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

            <template v-else-if="activeType === 'custom' || activeType === 'rating'">
              <PerformanceRepeatableFillItemList v-model:items="items" :invalid="submitted" :mixed="true" :show-question-type="true" :tag-options="tagOptions" :rating-options="ratingOptions" @add="addMixedItem" @remove="removeCustomItem" @reorder="reorderCustomItems" @drag-start="startCustomSort" @drag-end="finishCustomSort" @drag-cancel="cancelCustomSort" />
            </template>
          </div>

          <div class="preview-pane">
            <span class="preview-label">预览</span>
            <PerformanceAssessmentPreviewHeader class="preview-root-header" heading-tag="h3" :name="draft.name.trim() || '未命名名称'" :description="draft.description" />
            <template v-if="activeType==='rating' || activeType==='custom'">
              <template v-for="item in items" :key="`preview-${item.id}`">
                <div v-if="item.kind === 'prompt' && item.prompt" class="prompt-preview"><PerformancePromptDisplay :value="item.prompt" /></div>
                <div v-else-if="item.kind === 'rating'" class="rating-preview"><strong>{{ item.label || '未命名评估项' }}</strong><PerformanceRatingControl :options="ratingItemOptions(item)" :display-mode="ratingItemDisplayMode(item)" :interactive="false" :aria-label="`${item.label || '评估项'}预览`" /></div>
                <div v-else-if="item.questionType==='tag'" class="tag-preview"><PerformanceTemplateFieldRenderer mode="edit" :editable="true" :field="tagPreviewField(item)" :label="tagPreviewField(item).label" :value="tagPreviewValue(item)" @update:value="value => updateTagPreview(item, value)" /></div>
                <div v-else class="text-preview"><strong>{{ item.label.trim() || '未命名填写题' }}</strong><PerformanceRichTextEditor v-model="item.richText" :placeholder="item.hint || '请输入内容'" /></div>
              </template>
            </template>
            <template v-else-if="activeType==='work_summary'">
              <div v-for="item in workSummaryItems" :key="`preview-${item.id}`" class="text-preview"><strong>{{ item.label.trim() || '未命名填写题' }}</strong><PerformanceRichTextEditor :key="`editor-${item.id}`" v-model="item.richText" :placeholder="item.hint || '请输入内容'" /></div>
            </template>
            <div v-else-if="activeType!=='rating'" class="text-preview"><strong>{{ draft.itemName.trim() || '未命名填写题' }}</strong><PerformanceRichTextEditor v-model="draft.richText" :placeholder="draft.hint || '请输入内容'" /></div>
          </div>
        </div>
        <footer class="modal-footer"><button class="button button--secondary" type="button" @click="closeModal">取消</button><button class="button button--primary" type="button" @click="confirmContent">确定</button></footer>
    </PerformanceAssessmentEditorModal>
    <Transition name="toast"><div v-if="success" class="success-toast" role="status"><CircleCheckFilled /> 新建成功</div></Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue'
import type { PerformancePromptValue, PerformanceTemplateContentItem, PerformanceTemplateField } from '@/api/performance'
import { ArrowDown, ArrowUp, CircleCheckFilled, Close, Edit, Plus } from '@element-plus/icons-vue'
import { ElEmpty } from 'element-plus'
import PerformanceAssessmentEditorModal from './PerformanceAssessmentEditorModal.vue'
import PerformanceExpandButton from './PerformanceExpandButton.vue'
import PerformanceRepeatableFillItemList from './PerformanceRepeatableFillItemList.vue'
import PerformanceFormField from './PerformanceFormField.vue'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceContentOptionCard from './PerformanceContentOptionCard.vue'

export type AssessmentContentType = 'work_summary' | 'rating' | 'custom'
export interface AssessmentOption { id:string; label:string; description?:string; disabled?:boolean; disabledReason?:string; levels?:string[]; levelOptions?:Array<{id:string;label:string;color?:string}>; displayMode?:'标签样式'|'下拉样式' }
export interface AssessmentTagField { label:string; content:string }
export interface AssessmentTagOption extends AssessmentOption { defaultFields?:AssessmentTagField[] }
export interface AssessmentContentDraft { type:AssessmentContentType|'prompt'; name:string; description:string; items:Array<PerformanceTemplateContentItem>; prompt?:PerformancePromptValue; id?:string; content_id?:string; content_slot?:'fill'|'reference'|'adjustment'|'view'; settings?:{hideDescription?:boolean;allowMultiple?:boolean;allowUnknown?:boolean;mode?:string;required?:boolean}; ratingOptionId?:string; ratingDisplayMode?:'标签样式'|'下拉样式'; questionType?:'text'|'tag'; tagOptionId?:string; defaultAll?:boolean; options?:Array<{id:string;label:string;placeholder?:string;color?:string}> }
interface WorkSummaryItem { id:string; label:string; hint:string; richText:string }
interface FillItem { id:string; label:string; hint:string; richText?:string; kind?:'rating'|'fill'|'prompt'; prompt?:PerformancePromptValue; ratingOptionId?:string; ratingDisplayMode?:'标签样式'|'下拉样式'; questionType?:'text'|'tag'; tagOptionId?:string; defaultAll?:boolean; options?:Array<{id:string;label:string;placeholder?:string;color?:string}> }

const props=withDefaults(defineProps<{open:boolean;title?:string;ratingOptions?:AssessmentOption[];tagOptions?:AssessmentTagOption[];initialContents?:Array<AssessmentContentDraft&{id:string}>;availableContents?:Array<AssessmentContentDraft&{id:string}>;allowedTypes?:AssessmentContentType[];selectableContentIds?:string[];selectionRestriction?:string}>(),{title:'选择评估内容',ratingOptions:()=>[],tagOptions:()=>[],initialContents:()=>[],availableContents:()=>[],allowedTypes:()=>['work_summary','rating','custom'],selectionRestriction:''})
const emit=defineEmits<{'update:open':[boolean];confirm:[AssessmentContentDraft[]]}>()
const drawerRef=ref<HTMLElement|null>(null), modalRef=ref<HTMLElement|null>(null), modalCloseRef=ref<HTMLButtonElement|null>(null), createMenuRef=ref<{focus:()=>void}|null>(null)
const groupVisible=ref(true), activeType=ref<AssessmentContentType|null>(null), submitted=ref(false), itemSubmitted=ref(false), success=ref(false), draggedIndex=ref<number|null>(null), dragAnnouncement=ref(''), editingCreatedId=ref<string|null>(null), expandedIds=ref<Set<string>>(new Set())
const items=ref<FillItem[]>([]), created=ref<Array<AssessmentContentDraft&{id:string}>>([])
const tagSelections=ref<Record<string,string[]>>({})
const tagPreviewNotes=ref<Record<string,string>>({})
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
const nextId=()=>{let id:string;do{id=`assessment-content-${++idCounter}`}while([...items.value,...workSummaryItems.value,...drawerContents.value.flatMap(content=>content.items)].some(item=>item.id===id));return id}
const nextContentId=()=>`content-${Date.now()}-${++contentCounter}`
const activeLabel=computed(()=>({work_summary:'工作总结',rating:'评分评级',custom:'自定义'} as const)[activeType.value!]||'')
function ratingItemOptions(item:FillItem){if(item.options!==undefined)return item.options;const option=props.ratingOptions.find(candidate=>candidate.id===item.ratingOptionId||candidate.id===item.id);return option?.levelOptions||(option?.levels||[]).map((label,index)=>({id:`${option?.id||item.id}-${index}`,label}))}
function ratingItemDisplayMode(item:FillItem){return item.ratingDisplayMode||props.ratingOptions.find(candidate=>candidate.id===item.ratingOptionId||candidate.id===item.id)?.displayMode||'标签样式'}
function normalizeTagItem(item:FillItem){
  const source=props.tagOptions.find(option=>option.id===item.tagOptionId)
  return {...item,label:item.label?.trim()?item.label:source?.label||'标签型填写题',hint:item.hint??source?.description??'',options:item.options!==undefined?item.options.map(option=>({...option,placeholder:option.placeholder??source?.defaultFields?.find(field=>field.label===option.label)?.content??''})):source?.defaultFields?.map((field,index)=>({id:`${item.tagOptionId}-${index}`,label:field.label,placeholder:field.content}))}
}
const tagSelectionFor=(item:FillItem)=>tagSelections.value[item.id] || []
const tagPreviewOptions=(item:FillItem)=>(normalizeTagItem(item).options||[]).map(option=>({...option,id:option.label}))
const tagPreviewField=(item:FillItem):PerformanceTemplateField=>{const normalized=normalizeTagItem(item);return{id:item.id,type:'tag_with_followup',label:normalized.label,description:normalized.hint,options:tagPreviewOptions(item),required:false}}
const tagPreviewValue=(item:FillItem)=>({tags:tagSelectionFor(item),notes:Object.fromEntries(tagPreviewOptions(item).map(option=>[option.id,tagPreviewNotes.value[`${item.id}:${option.id}`]||'']))})
function updateTagPreview(item:FillItem,value:unknown){
  const next=value as {tags:string[];notes?:Record<string,string>}
  tagSelections.value={...tagSelections.value,[item.id]:next.tags}
  Object.entries(next.notes||{}).forEach(([label,note])=>{tagPreviewNotes.value[`${item.id}:${label}`]=note})
}
function syncTagSelections(){
  const next={...tagSelections.value}
  items.value.forEach(item=>{
    if(item.questionType!=='tag')return
    const fields=normalizeTagItem(item).options || []
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
const allExpanded=computed(()=>created.value.length>0&&expandedIds.value.size===created.value.length)

watch(()=>props.open,open=>{if(open){created.value=props.initialContents.map(content=>{const id=content.content_id||content.id||nextId();return JSON.parse(JSON.stringify({...content,id,content_id:id}))});void nextTick(()=>drawerRef.value?.focus())}else activeType.value=null},{ immediate:true })
watch(()=>draft.questionType,()=>{ itemSubmitted.value=false })
watch([items,()=>props.tagOptions],syncTagSelections,{deep:true,immediate:true})
function resetDraft(){Object.assign(draft,{name:'',description:'',itemName:'',hint:'',richText:'',ratingOptionId:'',questionType:'text',tagOptionId:'',defaultAll:false});items.value=[];tagSelections.value={};tagPreviewNotes.value={};previousDefaultAll.value={};previousTagOption.value={};workSummaryItems.value=[];submitted.value=false;itemSubmitted.value=false;draggedIndex.value=null;dragAnnouncement.value=''}
function closeDrawer(){activeType.value=null;emit('update:open',false)}
function contentKey(content:AssessmentContentDraft&{id:string}){return content.content_id||content.id}
function isContentSelected(id:string){return created.value.some(content=>contentKey(content)===id)}
function canSelectContent(content:AssessmentContentDraft&{id:string}){return props.selectableContentIds === undefined || props.selectableContentIds.includes(contentKey(content))}
function toggleAvailableContent(content:AssessmentContentDraft&{id:string}){
  const id=contentKey(content)
  if(isContentSelected(id)||!canSelectContent(content))return
  created.value.push(JSON.parse(JSON.stringify({ ...content, id, content_id:id })))
}
function finishDrawer(){if(created.value.some(content=>!canSelectContent(content)))return;emit('confirm',created.value.map(content=>({ ...content, content_id:content.content_id||content.id })));emit('update:open',false)}
function openModal(type:AssessmentContentType, content?:AssessmentContentDraft&{id:string}){
  resetDraft(); editingCreatedId.value=content?(content.content_id||content.id):null; activeType.value=type
  if(content){
    Object.assign(draft,{name:content.name,description:content.description,ratingOptionId:content.ratingOptionId||(type==='rating'?content.items[0]?.id||'':''),questionType:content.questionType||'text',tagOptionId:content.tagOptionId||'',defaultAll:!!content.defaultAll})
    if(type==='work_summary' || type==='custom' || type==='rating') {
      const fillItems=content.items.length?content.items:[{id:nextId(),label:'',hint:'',richText:''}]
      const targetItems=fillItems.map(item=>JSON.parse(JSON.stringify({...item,kind:item.kind||(type==='rating'?'rating':'fill'),ratingOptionId:item.kind==='rating'||(type==='rating'&&!item.kind)?(item as FillItem).ratingOptionId||content.ratingOptionId||item.id:undefined,ratingDisplayMode:item.ratingDisplayMode||(type==='rating'&&item.kind!=='fill'&&item.kind!=='prompt'?content.ratingDisplayMode:undefined),richText:item.richText||'',questionType:item.questionType||content.questionType||'text',tagOptionId:item.tagOptionId??content.tagOptionId,defaultAll:item.defaultAll??content.defaultAll,options:item.options??(item.kind==='fill'&&type==='rating'?undefined:content.options)})))
      if(type==='work_summary') workSummaryItems.value=targetItems
      else items.value=targetItems
    } else if(type==='rating') items.value=[]
  } else if(type==='rating') {
    items.value.push(createRatingItem())
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
function editCreated(content:AssessmentContentDraft&{id:string}){if(content.type==='prompt')return;openModal(content.type,content)}
defineExpose({ openEditor: (content: AssessmentContentDraft & { id: string }) => { if(content.type!=='prompt')openModal(content.type, content) } })
function addWorkSummaryItem(){workSummaryItems.value.push(createWorkSummaryItem())}
function createCustomFillItem():FillItem{return{id:nextId(),label:'',hint:'',richText:'',kind:'fill',questionType:'text',tagOptionId:'',defaultAll:false}}
function createPromptItem():FillItem{return{id:nextId(),label:'',hint:'',kind:'prompt',prompt:{title:'',content:'',color:'#3B82F6',scope:'all'}}}
function createRatingItem():FillItem{return{id:nextId(),label:'',hint:'',kind:'rating',ratingOptionId:''}}
function addMixedItem(kind:'fill'|'prompt'='fill'){items.value.push(kind==='prompt'?createPromptItem():createCustomFillItem())}
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
  if(activeType.value==='work_summary')return workSummaryItems.value.length>0&&workSummaryItems.value.every(item=>!!item.label.trim())
  return items.value.length>0&&items.value.every(item=>item.kind==='prompt'?!!item.prompt?.content?.trim()&&item.prompt.content.length<=2000:item.kind==='rating'?!!item.ratingOptionId:item.questionType==='tag'?!!item.tagOptionId:!!item.label.trim())
}
function confirmContent(){
  submitted.value=true;if(!activeType.value||!draft.name.trim()||!validItem())return
  const finalItems:AssessmentContentDraft['items']=activeType.value==='work_summary'
    ? workSummaryItems.value.map(({id,label,hint,richText})=>({id,label:label.trim(),hint:hint.trim(),richText,kind:'fill' as const}))
    : items.value.map(item=>{const normalized=item.questionType==='tag'?normalizeTagItem(item):item;return{...normalized,label:normalized.label.trim(),hint:(normalized.hint??'').trim()}})
  const existing=editingCreatedId.value?drawerContents.value.find(item=>contentKey(item)===editingCreatedId.value):undefined
  const preservedItems=finalItems.map(item=>({...existing?.items.find(value=>value.id===item.id),...item}))
  const ratingItem=preservedItems.find(item=>item.kind==='rating')
  const ratingOptionId=ratingItem?.ratingOptionId
  const ratingLevels=ratingItem?ratingItemOptions(ratingItem):[]
  const option=props.ratingOptions.find(candidate=>candidate.id===ratingOptionId)
  const sameRating=existing?.ratingOptionId===ratingOptionId
  const nextContent={...existing,type:activeType.value,name:draft.name.trim(),description:draft.description.trim(),items:preservedItems,ratingOptionId,ratingDisplayMode:activeType.value==='rating'?(sameRating?existing?.ratingDisplayMode||option?.displayMode:option?.displayMode):undefined,questionType:undefined,tagOptionId:undefined,defaultAll:undefined,options:activeType.value==='rating'?(sameRating?existing?.options??ratingLevels:ratingLevels):existing?.options}
  if(editingCreatedId.value){const id=editingCreatedId.value;const saved={...nextContent,id,content_id:existing?.content_id||id};const index=created.value.findIndex(item=>contentKey(item)===id);if(index>=0)created.value[index]=saved;else created.value.push(saved)}
  else {const contentId=nextContentId();created.value.push({id:contentId,content_id:contentId,...nextContent})}
  activeType.value=null;editingCreatedId.value=null;resetDraft();success.value=true;if(successTimer)clearTimeout(successTimer);successTimer=setTimeout(()=>success.value=false,2200);void nextTick(()=>drawerRef.value?.focus())
}
function focusables(root:HTMLElement|null){return root?Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')).filter(e=>e.offsetParent!==null||import.meta.env.MODE==='test'):[]}
function trapTab(event:KeyboardEvent,root:HTMLElement|null){const list=focusables(root);if(!list.length)return;const first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
function onDrawerKeydown(event:KeyboardEvent){if(activeType.value)return;if(event.key==='Escape'){event.preventDefault();closeDrawer()}else if(event.key==='Tab')trapTab(event,drawerRef.value)}
function onModalKeydown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();closeModal()}else if(event.key==='Tab'){const active=document.activeElement;const root=event.currentTarget as HTMLElement|null;if(!event.shiftKey&&active?.classList.contains('button--primary')){event.preventDefault();(root?.querySelector<HTMLButtonElement>('.performance-editor-modal__close')||modalCloseRef.value)?.focus();return}trapTab(event,root)}}
onBeforeUnmount(()=>{if(successTimer)clearTimeout(successTimer)})

const CreateMenu=defineComponent({props:{allowedTypes:{type:Array as ()=>AssessmentContentType[],default:()=>['work_summary','rating','custom']}},emits:['select'],setup(p,{emit:e,expose}){const open=ref(false),button=ref<HTMLButtonElement|null>(null);expose({focus:()=>button.value?.focus()});return()=>h('div',{class:'create-anchor'},[h('button',{ref:button,class:'button button--secondary create-button',type:'button','aria-expanded':String(open.value),'aria-haspopup':'menu',onClick:()=>open.value=!open.value},[h(Plus),h('span','新建')]),open.value?h('div',{class:'create-menu',role:'menu'},p.allowedTypes.map(type=>h('button',{type:'button',role:'menuitem',onClick:()=>{open.value=false;e('select',type)}},type==='work_summary'?'工作总结':type==='rating'?'评分评级':'自定义'))):null])}})
</script>

<style scoped>
.assessment-layer,.modal-layer{width:100vw;height:100vh}
.modal-slot { display: contents; }
.modal-slot > .modal-header, .modal-slot > .modal-footer { display: none; }
.assessment-layer,.modal-layer{position:fixed;inset:0;z-index:2100;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}.assessment-layer{pointer-events:none}.assessment-drawer{position:absolute;inset:0 0 0 auto;display:flex;flex-direction:column;width:680px;background:#fff;box-shadow:-8px 0 24px rgba(31,35,41,.12);outline:0;pointer-events:auto}.drawer-header,.modal-header{display:flex;align-items:center;justify-content:space-between;height:58px;min-height:58px;padding:0 20px;border-bottom:1px solid #dee0e3;box-sizing:border-box}.drawer-header h2,.modal-header h2{margin:0;font-size:18px;font-weight:600;line-height:26px}.icon-button{display:grid;place-items:center;width:32px;height:32px;padding:7px;border:0;border-radius:6px;background:transparent;color:#646a73;cursor:pointer}.icon-button:hover,.icon-button:focus-visible{background:#eff0f1;outline:0}.icon-button svg{width:18px}.drawer-body{position:relative;flex:1;min-height:0;overflow:auto;padding:20px;box-sizing:border-box}.visibility-row{display:flex;justify-content:space-between}.visibility-title{display:flex;align-items:center;gap:8px}.visibility-row p{margin:0;color:#646a73}.toggle{position:relative;width:28px;height:16px;padding:0;border:0;border-radius:8px;background:#bbbfc4;cursor:pointer}.toggle span{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}.toggle--on{background:#1456f0}.toggle--on span{left:14px}.divider{height:1px;margin-top:20px;background:#dee0e3}.button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:4px 16px;border-radius:6px;box-sizing:border-box;font:inherit;cursor:pointer}.button--secondary{border:1px solid #d0d3d6;background:#fff;color:#1f2329}.button--secondary:hover,.button--secondary:focus-visible{border-color:#3370ff;color:#245bdb;outline:0}.button--primary{border:1px solid #3370ff;background:#3370ff;color:#fff}.empty-state{position:absolute;inset:142px 20px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center}.empty-state :deep(.el-empty){padding:0}.empty-state :deep(.el-empty__description){margin-top:10px}.create-anchor{position:relative;display:inline-flex}.create-button{gap:4px;min-width:80px;margin-top:16px;color:#245bdb;border-color:#3370ff}.create-button svg{width:14px}.create-menu{position:absolute;z-index:5;top:52px;left:0;display:flex;flex-direction:column;min-width:96px;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.create-menu button{height:32px;padding:5px 12px;border:0;background:#fff;text-align:left;font:inherit;cursor:pointer}.create-menu button:hover{background:#eff0f1}.drawer-actions{display:flex;align-items:center;justify-content:space-between}.drawer-actions .create-button{margin-top:20px}.plain-button{margin-top:20px;border:0;background:transparent;font:inherit;cursor:pointer}.created-list{margin-top:16px}.created-list h3{margin:0 0 12px;font-size:14px}.created-list > .created-item + .created-item{margin-top:var(--performance-content-option-card-list-gap)}.drawer-footer{display:flex;gap:12px;height:64px;padding:16px 20px;border-top:1px solid #dee0e3;box-sizing:border-box}.modal-layer{z-index:2200;display:flex;align-items:center;justify-content:center;padding:32px 180px;box-sizing:border-box;background:rgba(31,35,41,.55)}.content-modal{display:flex;flex-direction:column;width:min(1080px,calc(100vw - 360px));max-height:calc(100vh - 64px);overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 12px 32px rgba(31,35,41,.2)}.content-modal--work_summary{height:650px}.content-modal--rating{height:559px}.content-modal--custom{height:722px}.modal-header{height:72px;min-height:72px;padding:0 24px}.modal-body{display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0}.config-pane,.preview-pane{min-width:0;overflow:auto;padding:10px 24px 12px;box-sizing:border-box}.config-pane{border-right:1px solid #dee0e3}.form-field{display:block;margin-bottom:18px}.field-label{display:block;margin-bottom:6px;font-weight:600}.field-label i,.type-field i{margin-left:2px;color:#f54a45;font-style:normal}.form-field input,.form-field textarea{display:block;width:100%;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;background:#fff;font:inherit;outline:0}.form-field textarea{resize:vertical}.form-field input:focus,.form-field textarea:focus{border-color:#3370ff}.invalid,.select-shell.invalid{border-color:#f54a45!important}.field-error{display:block;margin-top:2px;color:#f54a45;font-size:13px}.section-title{margin:2px 0 8px;font-size:14px}.config-box{border:1px solid #dee0e3;border-radius:6px}.config-box__heading{height:42px;padding:10px 20px;box-sizing:border-box;background:#f5f6f7;color:#646a73}.form-field--inside,.inside-select{display:block;margin:18px 20px}.saved-item{display:grid;grid-template-columns:18px 1fr 24px;align-items:center;gap:8px;min-height:42px;padding:8px 12px;border-bottom:1px solid #eff0f1}.drag-handle{width:16px;color:#8f959e;cursor:grab}.saved-item button{display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e}.saved-item button svg{width:14px}.type-field{margin:18px 20px 16px;padding:0;border:0}.type-field legend{margin-bottom:8px;font-weight:600}.type-field label{margin-right:20px}.type-field input{width:16px;height:16px;margin:0 4px 0 0;vertical-align:-3px;accent-color:#1456f0}.option-field{display:block}.select-shell{position:relative;border:1px solid #d0d3d6;border-radius:6px}.select-shell.open{border-color:#3370ff}.select-shell>button{display:flex;align-items:center;justify-content:space-between;width:100%;height:30px;padding:4px 11px;border:0;border-radius:6px;background:#fff;font:inherit;text-align:left}.select-shell>button svg{width:14px}.placeholder{color:#8f959e}.option-menu{position:absolute;z-index:10;top:36px;right:-1px;left:-1px;max-height:220px;overflow:auto;padding:4px 0;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.option-menu>button{position:relative;display:flex;flex-direction:column;width:100%;min-height:44px;padding:6px 12px;border:0;background:#fff;text-align:left;font:inherit}.option-menu>button:hover:not(:disabled){background:#eff0f1}.option-menu>button:disabled{color:#8f959e}.option-menu small{color:#8f959e}.option-menu em{position:absolute;right:10px;top:6px;font-size:12px;font-style:normal}.option-empty{padding:10px;color:#8f959e;text-align:center}.default-all{display:flex;align-items:center;gap:8px;margin:0 20px 18px}.add-button{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;height:46px;margin-top:8px;border:0;background:#f5f6f7;color:#245bdb;font:inherit}.add-button svg{width:14px}.custom-added-items{display:flex;flex-direction:column;gap:8px;margin-top:8px}.custom-added-item{display:block;overflow:hidden}.custom-added-item .config-box__heading{display:flex;align-items:center;justify-content:space-between}.custom-added-item__name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.custom-added-item button{display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e;cursor:pointer}.custom-added-item button:hover,.custom-added-item button:focus-visible{color:#f54a45;background:#fff1f0;outline:0}.custom-added-item button svg{width:14px}.custom-added-item__tag-label{margin:18px 20px 8px;font-weight:600}.custom-added-item__options{display:flex;flex-wrap:wrap;gap:8px;margin:0 20px 18px}.custom-added-item__options span{padding:2px 8px;border-radius:4px;background:#f5f6f7;color:#646a73}.preview-label{display:inline-block;margin-left:-18px;padding:0 4px;background:#eff0f1;font-weight:600}.preview-root-header{margin-top:26px}.text-preview>strong,.rating-preview>strong{display:block;margin:16px 0 8px}.rating-preview :deep(.performance-option-navigator){margin:16px 0 0 15px}.rating-select-preview{display:flex;align-items:center;justify-content:space-between;width:336px;height:32px;margin:16px 0 0 15px;padding:4px 12px;box-sizing:border-box;border-radius:6px;background:#f5f6f7;color:#8f959e;font-size:14px;line-height:22px}.rating-select-preview__arrow{display:block;flex:0 0 12px;width:12px;height:12px;color:#646a73;overflow:hidden}.modal-footer{display:flex;justify-content:flex-end;gap:12px;height:81px;min-height:81px;padding:24px;box-sizing:border-box;border-top:1px solid #dee0e3}.success-toast{position:fixed;z-index:2300;top:40px;left:50%;display:flex;align-items:center;gap:8px;height:54px;padding:0 20px;border:1px solid #34c759;border-radius:8px;background:#f0fff4;box-shadow:0 8px 24px rgba(31,35,41,.14);transform:translateX(-50%);font-weight:600}.success-toast svg{width:16px;color:#34a853}.toast-enter-active,.toast-leave-active{transition:opacity .15s,transform .15s}.toast-enter-from,.toast-leave-to{opacity:0;transform:translate(-50%,-8px)}
@media(max-width:1440px){.content-modal{width:calc(100vw - 360px);height:calc(100vh - 64px)}}
.expand-all-button{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px}
.expand-all-button:hover,.expand-all-button:focus-visible{background:#eff0f1;outline:0}
.expand-all-button svg{width:16px}
.created-item{border-color:var(--performance-content-option-card-border);border-radius:var(--performance-content-option-card-radius);background:var(--performance-content-option-card-background)}
.created-item input{accent-color:#8f959e;opacity:.65}.created-item input:disabled{pointer-events:none}
.created-item > strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.created-item__actions{display:flex;align-items:center;gap:2px}
.created-item > :deep(.performance-checkbox),.created-item > :deep(.performance-info-popover-root){width:16px;min-width:16px}
.created-item :deep(.performance-checkbox__label){display:none}
.created-item--unavailable > strong{color:var(--color-text-disabled)}
.content-selection-restriction{margin:var(--spacing-3) 0 0;color:var(--color-text-secondary);font:400 var(--font-size-md)/22px var(--font-sans)}
.created-item__actions button{display:grid;place-items:center;width:28px;height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:#646a73;cursor:pointer}
.created-item__actions button:hover,.created-item__actions button:focus-visible{background:#eff0f1;color:#3370ff;outline:0}
.created-item__actions svg{width:16px}
.created-item__details{padding:0 0 12px;color:#646a73}
.created-item__detail{padding:4px 0}
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
</style>
