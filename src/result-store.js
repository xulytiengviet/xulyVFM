// One in-memory result. Conversion never opens a save dialog.
import { saveBytes } from './geo-exchange.js';
export function createResultStore({onChange=()=>{},onStatus=()=>{},picker=options=>window.showSaveFilePicker(options),download=saveBytes}={}){
  let result=null;
  return {
    get current(){return result;},
    set(bytes,fileName,mime='application/octet-stream'){
      const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mime});
      result={blob,fileName,mime};onChange(result);onStatus('Đã chuyển đổi — sẵn sàng tải.');
    },
    clear(){result=null;onChange(null);onStatus('Đã xóa kết quả khỏi phiên.');},
    async download(){
      const item=result;if(!item)return;
      try{await download(item.blob,item.fileName,item.mime);onStatus('Đã gửi file tới trình duyệt. Bạn vẫn có thể tải lại kết quả.');}
      catch(err){onStatus('Không tải được file: '+err.message+'. Kết quả vẫn được giữ để thử lại.');}
    },
    async saveAs(){
      const item=result;if(!item)return;
      let writable;
      try{
        // Must be the first await after the Save as button's click.
        const handle=await picker({suggestedName:item.fileName});
        writable=await handle.createWritable();await writable.write(item.blob);await writable.close();writable=null;
        onStatus('Đã lưu file. Kết quả vẫn có thể tải lại.');
      }catch(err){
        if(writable)try{await writable.abort();}catch{}
        if(err.name==='AbortError')onStatus('Chưa lưu file: hộp thoại lưu đã đóng hoặc yêu cầu bị hủy. Kết quả vẫn sẵn sàng.');
        else if(err.name==='SecurityError'||err.name==='NotAllowedError')onStatus('Trình duyệt không cho phép lưu trực tiếp. Hãy chọn Tải xuống thông thường; kết quả vẫn được giữ.');
        else onStatus('Không lưu được file: '+err.message+'. Kết quả vẫn được giữ để thử lại.');
      }
    }
  };
}
